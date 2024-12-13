import type { Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { promisify } from 'util';
import fs from 'fs/promises';
import { pascalCase } from "change-case";
import mime from 'mime';
import type { OutputBundle } from 'rollup';
import { gzip } from '@gfx/zopfli';
import chalk from 'chalk';

const zopfliCompress = promisify(gzip);

interface CompressedOutput {
    name: string;
    length: number;
    array: string;
    contentType: string;
    useCompression: boolean;
}

interface Asset {
    path: string;
    name: string;
    content: string | Buffer | Uint8Array;
    contentType: string;
    type: string;
	isServer: boolean;
}

interface CompressStats {
    fileName: string;
    inputSize: number;
    compressedSize: number;
    groupName: string;
    useCompression: boolean;
}

interface CppPluginOptions {
    outPrefix?: string;   // Prefix for output files
    basePath?: string;    // Base URL path (e.g., '/ui', '/app', etc.)
    staticDir?: string;   // Directory for static assets
    outputDir?: string;   // Directory for C++ headers
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    return `${kb.toFixed(2)} kB`;
}

function padEnd(str: string, len: number): string {
    return str.padEnd(len, ' ');
}

function hexdump(buffer: Uint8Array): string {
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i += 16) {
        const block = buffer.slice(i, i + 16);
        const hexArray = Array.from(block).map(value =>
            "0x" + value.toString(16).padStart(2, "0")
        );
        lines.push(`  ${hexArray.join(", ")}`);
    }
    return lines.join(",\n");
}

async function compressAsset(input: string | Buffer | Uint8Array, fileName: string, contentType?: string): Promise<CompressedOutput> {
    const options = {
        blocksplitting: true,
        blocksplittinglast: false,
        blocksplittingmax: 15,
        verbose: false
    };

    const inputBuffer = Buffer.from(input);
    const compressed = await zopfliCompress(inputBuffer, options);
    const useCompression = compressed.length < inputBuffer.length;

    // Use whichever is smaller
    const finalBuffer = useCompression ? compressed : inputBuffer;

    return {
        name: fileName.replace(/[.-]/g, "_").toUpperCase(),
        length: finalBuffer.length,
        array: hexdump(finalBuffer),
        contentType: contentType || mime.getType(fileName) || 'application/octet-stream',
        useCompression
    };
}

export function cppPlugin(options: CppPluginOptions = {}): Plugin {
    let assets = new Map<string, Asset>();
    let compressedStats: CompressStats[] = [];
    let bundleAssets: Map<string, Asset> = new Map();

    const basePath = options.basePath || '';
    const staticDir = resolve(__dirname, options.staticDir || '../static');
    const outputDir = resolve(__dirname, options.outputDir || '../../src');
    console.log('Plugin initialized with output directory:', outputDir);
    const getOutputPath = (path: string, isServer: boolean) => {
        const prefix = isServer ? 'server_' : '';
        return resolve(outputDir, `${prefix}${path}`);
    };
    const outPrefix = options.outPrefix || 'web_';

    function getGroupName(path: string, type: string): string {
        const dir = dirname(path);
        if (dir === '.') return `${outPrefix}${type}`;
        return outPrefix + dir.replace(/\//g, '_') + '_' + type;
    }

    return {
        name: 'cpp',
        enforce: 'post',
        apply: 'build',

        async buildStart() {
            assets.clear();
            compressedStats = [];
            bundleAssets.clear();

            try {
                const files = await fs.readdir(staticDir);
                for (const file of files) {
                    if (file.startsWith('.')) continue;

                    const filePath = resolve(staticDir, file);
                    const stats = await fs.stat(filePath);
                    if (stats.isFile()) {
                        const content = await fs.readFile(filePath);
                        const ext = file.split('.').pop()?.toLowerCase() || '';
                        assets.set(file, {
                                                    path: file,
                                                    name: file.replace(/[.-]/g, '_'),
                                                    content,
                                                    contentType: mime.getType(file) || 'application/octet-stream',
                                                    type: ext,
                                                    isServer: false
                                                });
                    }
                }
                if (assets.size > 0) {
                    console.log(`Captured ${assets.size} static assets from ${staticDir}`);
                }
            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    console.error(`Error reading static directory ${staticDir}:`, error);
                }
            }
        },

        transformIndexHtml: {
            order: 'post',
            handler(html: string, { filename }) {
                // Skip if this is SSR
                if (filename.includes('.svelte-kit/output/server')) return html;

                const basename = filename.split('/').pop() || filename;
                const isServer = filename.includes('.svelte-kit/output/server');
                bundleAssets.set(basename, {
                    path: basename,
                    name: basename.replace('.html', '_html').replace(/[.-]/g, '_'),
                    content: html,
                    contentType: 'text/html',
                    type: 'html',
                    isServer
                });

                return html;
            }
        },

        async generateBundle(_, bundle) {
            // Determine if this is a server build
            const isServer = Object.keys(bundle).some(key =>
                key.startsWith('.svelte-kit/output/server/') ||
                key.includes('/server/') ||
                key.includes('entries/')
            );

            for (const [fileName, file] of Object.entries(bundle)) {
                if (fileName.split('/')[0].startsWith('.')) continue;
                if (fileName.endsWith('.json')) continue;
                if (fileName.endsWith('.html')) continue; // Already handled by transformIndexHtml

                const content = file.type === 'chunk'
                    ? file.code
                    : file.source;
                const ext = fileName.split('.').pop()?.toLowerCase() || '';

                // Only include assets that aren't manifest or metadata files
                if (!fileName.endsWith('.json')) {
                    bundleAssets.set(fileName, {
                        path: fileName,
                        name: fileName.replace(/[\/\\]/g, '_').replace(/[.-]/g, '_'),
                        content,
                        contentType: file.type === 'chunk'
                            ? 'application/javascript'
                            : mime.getType(fileName) || 'application/octet-stream',
                        type: ext,
                        isServer
                    });
                }
            }
        },

        closeBundle: {
            sequential: true,
            order: 'post',
            async handler() {
                // If we have no assets, skip processing
                if (bundleAssets.size === 0 && assets.size === 0) return;

                // Group assets by directory path and type
                const groupedAssets = new Map<string, Asset[]>();

                // Wait for adapter-static to finish and process HTML files
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Process HTML files from build directory
                try {
                    const buildDir = resolve(__dirname, '../build');
                    console.log('Looking for HTML files in:', buildDir);
                    const entries = await fs.readdir(buildDir);
                    console.log('Found files:', entries);

                    // Create a dedicated group for HTML files
                    const htmlGroup: Asset[] = [];

                    for (const entry of entries) {
                        if (entry.endsWith('.html')) {
const fullPath = resolve(buildDir, entry);
                            const content = await fs.readFile(fullPath, 'utf-8');
                            console.log('Processing HTML file:', entry);

                            const htmlAsset: Asset = {
                                path: entry,
                                name: entry.replace(/[.-]/g, '_'),
                                content,
                                contentType: 'text/html',
                                type: 'html',
																																isServer: false
                            };

                            // Add to bundle assets and HTML group
                            bundleAssets.set(entry, htmlAsset);
                            htmlGroup.push(htmlAsset);
                        }
                    }

                    // Add HTML group to client assets
                    if (htmlGroup.length > 0) {
                        groupedAssets.set('ui_html', htmlGroup);
                    }
                } catch (error: any) {
                    console.error('Error processing HTML files:', error);
                }

                // Add bundle assets (excluding HTML files), separating server and client assets
                const clientAssets = new Map<string, Asset[]>();
                const serverAssets = new Map<string, Asset[]>();

                for (const asset of bundleAssets.values()) {
                    if (asset.type !== 'html') {
                        const groupName = getGroupName(asset.path, asset.type);
                        const targetMap = asset.isServer ? serverAssets : clientAssets;
                        const group = targetMap.get(groupName) || [];
                        group.push(asset);
                        targetMap.set(groupName, group);
                    }
                }

                // Process client assets
                for (const [groupName, assets] of clientAssets) {
                    const group = groupedAssets.get(groupName) || [];
                    group.push(...assets);
                    groupedAssets.set(groupName, group);
                }

                // Process server assets with server_ prefix
                for (const [groupName, assets] of serverAssets) {
                    const serverGroupName = `server_${groupName}`;
                    const group = groupedAssets.get(serverGroupName) || [];
                    group.push(...assets);
                    groupedAssets.set(serverGroupName, group);
                }

                // Add static assets (these are always client-side)
                for (const asset of assets.values()) {
                    const groupName = getGroupName(asset.path, asset.type);
                    const group = groupedAssets.get(groupName) || [];
                    group.push({
                        ...asset,
                        isServer: false
                    });
                    groupedAssets.set(groupName, group);
                }

                // Generate headers
                try {
                    console.log(`Creating output directory: ${outputDir}`);
                                        await fs.mkdir(outputDir, { recursive: true });
                                        console.log(`Output directory created/exists at: ${outputDir}`);

                    const routes: string[] = [];
                    const htmlRoutes: string[] = [];
                    let totalInputSize = 0;
                    let totalCompressedSize = 0;

                    // Generate a header file for each group
                    for (const [groupName, groupAssets] of groupedAssets) {
                        let header = `/*
 * Binary arrays for the Web UI ${groupName} files.
 */

#pragma once
#include <ESPAsyncWebServer.h>
#include <Arduino.h>

`;

                        for (const asset of groupAssets) {
                            const inputSize = Buffer.from(asset.content).length;
                            const compressed = await compressAsset(asset.content, asset.name, asset.contentType);

                            compressedStats.push({
                                fileName: asset.path,
                                inputSize,
                                compressedSize: compressed.length,
                                groupName,
                                useCompression: compressed.useCompression
                            });

                            totalInputSize += inputSize;
                            totalCompressedSize += compressed.length;

                            header += `// ${asset.path}\n`;
                            header += `const uint16_t ${compressed.name}_L = ${compressed.length};\n`;
                            header += `const uint8_t ${compressed.name}[] PROGMEM = {\n${compressed.array}\n};\n\n`;
                            header += `inline void serve${pascalCase(asset.name)}(AsyncWebServerRequest* request) {\n`;
                            header += `  AsyncWebServerResponse *response = request->beginResponse_P(200, "${asset.contentType}", ${compressed.name}, ${compressed.name}_L);\n`;
                            if (compressed.useCompression) {
                                header += `  response->addHeader(F("Content-Encoding"), "gzip");\n`;
                            }
                            header += `  request->send(response);\n`;
                            header += `}\n\n`;

                            // Add routes
                            if (asset.type === 'html') {
                                const routePath = asset.path === 'index.html'
                                    ? basePath + '/'
                                    : basePath + '/' + asset.path.slice(0, -5);  // Remove .html
                                htmlRoutes.push(`    server->on("${routePath}", HTTP_GET, serve${pascalCase(asset.name)});`);
                                if (routePath !== basePath + '/') {
                                    htmlRoutes.push(`    server->on("${routePath}.html", HTTP_GET, serve${pascalCase(asset.name)});`);
                                }
                            } else {
                                routes.push(`    server->on("${basePath}/${asset.path}", HTTP_GET, serve${pascalCase(asset.name)});`);
                            }
                        }

                        // Use the group name to determine if it's a server file
                        const isServerGroup = groupName.startsWith('server_');
                        console.log(`Writing ${isServerGroup ? 'server' : 'client'} file: ${getOutputPath(`${groupName}.h`, isServerGroup)}`);
                        console.log('Bundle assets:', Array.from(bundleAssets.keys()));
                        const filePath = getOutputPath(`${groupName}.h`, isServerGroup);
                                                try {
                                                    await fs.writeFile(filePath, header);
                                                    console.log(`Successfully wrote file: ${filePath}`);
                                                } catch (error) {
                                                    console.error(`Error writing file ${filePath}:`, error);
                                                }
                    }

                    // Output compression stats
                    console.log(chalk.cyan('\nGenerating C++ headers for web UI assets:'));
                    console.log(chalk.dim('─'.repeat(100)));

                    // Sort by group and size
                    compressedStats.sort((a, b) => {
                        if (a.groupName === b.groupName) {
                            return b.compressedSize - a.compressedSize;
                        }
                        return a.groupName.localeCompare(b.groupName);
                    });

                    let currentGroup = '';
                    for (const stat of compressedStats) {
                        if (stat.groupName !== currentGroup) {
                            if (currentGroup !== '') console.log('');
                            currentGroup = stat.groupName;
                        }

                        const ratio = stat.compressedSize / stat.inputSize;
                        const compressionResult = stat.useCompression ? chalk.dim('gzip') : chalk.yellow('uncompressed');
                        console.log(
                            chalk.dim(padEnd(stat.fileName, 70)) +
                            chalk.blue(padEnd(formatSize(stat.inputSize), 10)) +
                            compressionResult + ': ' +
                            chalk.green(formatSize(stat.compressedSize)) +
                            chalk.dim(` (${(ratio * 100).toFixed(1)}%)`)
                        );
                    }

                    console.log(chalk.dim('\n' + '─'.repeat(100)));
                    console.log(
                        chalk.cyan('Total compressed size: ') +
                        chalk.green(formatSize(totalCompressedSize)) +
                        chalk.dim(` (${((totalCompressedSize / totalInputSize) * 100).toFixed(1)}% of ${formatSize(totalInputSize)})`)
                    );
                    console.log(chalk.green(`Generated C++ headers in ${outputDir}\n`));

                    // Generate routes header with size information
                    const sizeComments = Array.from(groupedAssets.entries()).map(([groupName, assets]) => {
                        const groupStats = compressedStats.filter(stat => stat.groupName === groupName);
                        const totalGroupBytes = groupStats.reduce((sum, stat) => sum + stat.compressedSize, 0);
                        return ` * ${groupName}: ${totalGroupBytes.toLocaleString()} bytes`;
                    });

                    const routesHeader = `/*
 * Web UI Routes
 *
 * Compressed Size Summary:
${sizeComments.join('\n')}
 * Total: ${totalCompressedSize.toLocaleString()} bytes
 */

#pragma once

#include <ESPAsyncWebServer.h>
${Array.from(groupedAssets.keys()).map(group => `#include "${group}.h"`).join('\n')}

inline void setupRoutes(AsyncWebServer* server) {
${routes.join('\n')}

    // HTML routes
${htmlRoutes.join('\n')}
}`;

                    // Use the presence of server_ prefixed groups to determine if this is a server build
                    const isServer = Array.from(groupedAssets.keys()).some(name => name.startsWith('server_'));
                    console.log('\nWriting routes file:');
                    console.log('Is server build:', isServer);
                    console.log('Output path:', getOutputPath(`${outPrefix}routes.h`, isServer));
                    console.log('Grouped assets:', Array.from(groupedAssets.keys()));
                    const routesPath = getOutputPath(`${outPrefix}routes.h`, isServer);
                                        try {
                                            await fs.writeFile(routesPath, routesHeader);
                                            console.log(`Successfully wrote routes file: ${routesPath}`);
                                        } catch (error) {
                                            console.error(`Error writing routes file ${routesPath}:`, error);
                                        }

                } catch (error) {
                    console.error(chalk.red(`Error writing output files to ${outputDir}:`), error);
                }
            }
        }
    };
}

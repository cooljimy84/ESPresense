import os
import gzip
import hashlib
import mimetypes
from pathlib import Path
from change_case import pascalcase
from typing import List, Tuple, Dict
import shutil

# Configuration
BASE_PATH = '/ui'
OUT_PREFIX = 'ui_'
STATIC_DIR = Path(__file__).parent.parent / 'static'
OUTPUT_DIR = Path(__file__).parent.parent.parent / 'src'
BUILD_DIR = Path(__file__).parent.parent / 'build'

def format_size(bytes: int) -> str:
    if bytes < 1024:
        return f"{bytes} B"
    kb = bytes / 1024
    return f"{kb:.2f} kB"

def hexdump(buffer: bytes) -> str:
    lines = []
    for i in range(0, len(buffer), 16):
        block = buffer[i:i+16]
        hex_array = [f"0x{value:02x}" for value in block]
        lines.append(f"  {', '.join(hex_array)}")
    return ",\n".join(lines)

def compress_asset(content: bytes, file_name: str) -> Tuple[bytes, bool, str]:
    compressed = gzip.compress(content, compresslevel=9)
    use_compression = len(compressed) < len(content)
    final_buffer = compressed if use_compression else content
    content_type = mimetypes.guess_type(file_name)[0] or 'application/octet-stream'
    return final_buffer, use_compression, content_type

def get_group_name(path: str, type: str) -> str:
    dir_name = os.path.dirname(path)
    if dir_name == '':
        return f"{OUT_PREFIX}{type}"
    return f"{OUT_PREFIX}{dir_name.replace('/', '_')}_{type}"

def process_assets() -> Tuple[List[Dict], List[Dict]]:
    assets = []
    static_assets = []

    # Process static assets
    if STATIC_DIR.exists():
        for item in STATIC_DIR.iterdir():
            if item.is_file() and not item.name.startswith('.'):
                content = item.read_bytes()
                ext = item.name.split('.')[-1].lower()
                static_assets.append({
                    'path': str(item.relative_to(STATIC_DIR)),
                    'name': item.name.replace('.', '_'),
                    'content': content,
                    'type': ext,
                    'is_server': False
                })
        print(f"Captured {len(static_assets)} static assets from {STATIC_DIR}")

    # Process build directory for HTML files
    if BUILD_DIR.exists():
        for item in BUILD_DIR.iterdir():
            if item.is_file() and item.name.endswith('.html'):
                content = item.read_text()
                assets.append({
                    'path': str(item.relative_to(BUILD_DIR)),
                    'name': item.name.replace('.', '_'),
                    'content': content.encode('utf-8'),
                    'type': 'html',
                    'is_server': False
                })
        print(f"Captured {len(assets)} HTML assets from {BUILD_DIR}")

    # Process files from .svelte-kit/output/client
    client_dir = BUILD_DIR / '.svelte-kit/output/client'
    if client_dir.exists():
        for root, _, files in os.walk(client_dir):
            for file in files:
                if file.startswith('.') or file.endswith('.json'):
                    continue
                file_path = Path(root) / file
                content = file_path.read_bytes()
                ext = file.split('.')[-1].lower()
                assets.append({
                    'path': str(file_path.relative_to(client_dir)),
                    'name': file.replace('/', '_').replace('.', '_'),
                    'content': content,
                    'type': ext,
                    'is_server': False
                })
        print(f"Captured {len(assets)} client assets from {client_dir}")

    # Process files from .svelte-kit/output/server
    server_dir = BUILD_DIR / '.svelte-kit/output/server'
    if server_dir.exists():
        for root, _, files in os.walk(server_dir):
            for file in files:
                if file.startswith('.') or file.endswith('.json'):
                    continue
                file_path = Path(root) / file
                content = file_path.read_bytes()
                ext = file.split('.')[-1].lower()
                assets.append({
                    'path': str(file_path.relative_to(server_dir)),
                    'name': file.replace('/', '_').replace('.', '_'),
                    'content': content,
                    'type': ext,
                    'is_server': True
                })
        print(f"Captured {len(assets)} server assets from {server_dir}")

    return assets, static_assets

def generate_headers(assets: List[Dict], static_assets: List[Dict]) -> None:
    grouped_assets = {}
    compressed_stats = []
    total_input_size = 0
    total_compressed_size = 0
    routes = []
    html_routes = []

    # Group assets
    for asset in assets:
        group_name = get_group_name(asset['path'], asset['type'])
        if asset['is_server']:
            group_name = f"server_{group_name}"
        if group_name not in grouped_assets:
            grouped_assets[group_name] = []
        grouped_assets[group_name].append(asset)

    # Add static assets
    for asset in static_assets:
        group_name = get_group_name(asset['path'], asset['type'])
        if group_name not in grouped_assets:
            grouped_assets[group_name] = []
        grouped_assets[group_name].append(asset)

    # Generate headers
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for group_name, group_assets in grouped_assets.items():
        header = f"""/*
 * Binary arrays for the Web UI {group_name} files.
 */

#pragma once
#include <ESPAsyncWebServer.h>
#include <Arduino.h>

"""
        for asset in group_assets:
            compressed_content, use_compression, content_type = compress_asset(asset['content'], asset['name'])
            input_size = len(asset['content'])
            compressed_size = len(compressed_content)
            compressed_name = asset['name'].replace('-', '_').upper()
            compressed_stats.append({
                'file_name': asset['path'],
                'input_size': input_size,
                'compressed_size': compressed_size,
                'group_name': group_name,
                'use_compression': use_compression
            })
            total_input_size += input_size
            total_compressed_size += compressed_size

            header += f"// {asset['path']}\n"
            header += f"const uint16_t {compressed_name}_L = {compressed_size};\n"
            header += f"const uint8_t {compressed_name}[] PROGMEM = {{\n{hexdump(compressed_content)}\n}};\n\n"
            header += f"inline void serve{pascalcase(asset['name'])}(AsyncWebServerRequest* request) {{\n"
            header += f'  AsyncWebServerResponse *response = request->beginResponse_P(200, "{content_type}", {compressed_name}, {compressed_name}_L);\n'
            if use_compression:
                header += '  response->addHeader(F("Content-Encoding"), "gzip");\n'
            header += "  request->send(response);\n"
            header += "}\n\n"

            # Add routes
            if asset['type'] == 'html':
                route_path = BASE_PATH + '/'
                if asset['path'] != 'index.html':
                    route_path = BASE_PATH + '/' + asset['path'][:-5]
                html_routes.append(f'    server->on("{route_path}", HTTP_GET, serve{pascalcase(asset["name"])});')
                if route_path != BASE_PATH + '/':
                    html_routes.append(f'    server->on("{route_path}.html", HTTP_GET, serve{pascalcase(asset["name"])});')
            else:
                routes.append(f'    server->on("{BASE_PATH}/{asset["path"]}", HTTP_GET, serve{pascalcase(asset["name"])});')

        file_path = OUTPUT_DIR / f"{group_name}.h"
        file_path.write_text(header)
        print(f"Wrote header file: {file_path}")

    # Output compression stats
    print('\nGenerating C++ headers for web UI assets:')
    print('─' * 100)
    compressed_stats.sort(key=lambda x: (x['group_name'], -x['compressed_size']))
    current_group = ''
    for stat in compressed_stats:
        if stat['group_name'] != current_group:
            if current_group != '':
                print('')
            current_group = stat['group_name']
        ratio = stat['compressed_size'] / stat['input_size']
        compression_result = 'gzip' if stat['use_compression'] else 'uncompressed'
        print(
            f"{stat['file_name']:<70} {format_size(stat['input_size']):<10} {compression_result:<12} {format_size(stat['compressed_size'])} ({ratio * 100:.1f}%)"
        )
    print('\n' + '─' * 100)
    print(f"Total compressed size: {format_size(total_compressed_size)} ({(total_compressed_size / total_input_size) * 100:.1f}% of {format_size(total_input_size)})")
    print(f"Generated C++ headers in {OUTPUT_DIR}\n")

    # Generate routes header
    size_comments = [f" * {group_name}: {sum(stat['compressed_size'] for stat in compressed_stats if stat['group_name'] == group_name):,} bytes" for group_name in grouped_assets]
    routes_header = f"""/*
 * Web UI Routes
 *
 * Compressed Size Summary:
{chr(10).join(size_comments)}
 * Total: {total_compressed_size:,} bytes
 */

#pragma once

#include <ESPAsyncWebServer.h>
{chr(10).join(f'#include "{group}.h"' for group in grouped_assets)}

inline void setupRoutes(AsyncWebServer* server) {{
{chr(10).join(routes)}

    // HTML routes
{chr(10).join(html_routes)}
}}
"""
    routes_path = OUTPUT_DIR / f"{OUT_PREFIX}routes.h"
    routes_path.write_text(routes_header)
    print(f"Wrote routes file: {routes_path}")

def main():
    assets, static_assets = process_assets()
    generate_headers(assets, static_assets)

if __name__ == "__main__":
    main()

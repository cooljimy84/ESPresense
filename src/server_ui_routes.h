/*
 * Web UI Routes
 *
 * Compressed Size Summary:
 * server_ui_js: 256 bytes
 * server_ui_entries_pages_js: 227 bytes
 * server_ui_entries_fallbacks_js: 70 bytes
 * server_ui_entries_pages_devices_js: 73 bytes
 * server_ui_entries_pages_fingerprints_js: 73 bytes
 * server_ui_entries_pages_settings_js: 73 bytes
 * server_ui_chunks_js: 44,624 bytes
 * server_ui_app_immutable_assets_css: 3,858 bytes
 * ui_svg: 456 bytes
 * Total: 49,710 bytes
 */

#pragma once

#include <ESPAsyncWebServer.h>
#include "server_ui_js.h"
#include "server_ui_entries_pages_js.h"
#include "server_ui_entries_fallbacks_js.h"
#include "server_ui_entries_pages_devices_js.h"
#include "server_ui_entries_pages_fingerprints_js.h"
#include "server_ui_entries_pages_settings_js.h"
#include "server_ui_chunks_js.h"
#include "server_ui_app_immutable_assets_css.h"
#include "ui_svg.h"

inline void setupRoutes(AsyncWebServer* server) {
    server->on("/ui/internal.js", HTTP_GET, serveInternalJs);
    server->on("/ui/index.js", HTTP_GET, serveIndexJs);
    server->on("/ui/entries/pages/_layout.svelte.js", HTTP_GET, serveEntriesPagesLayoutSvelteJs);
    server->on("/ui/entries/pages/_layout.ts.js", HTTP_GET, serveEntriesPagesLayoutTsJs);
    server->on("/ui/entries/pages/_page.svelte.js", HTTP_GET, serveEntriesPagesPageSvelteJs);
    server->on("/ui/entries/fallbacks/error.svelte.js", HTTP_GET, serveEntriesFallbacksErrorSvelteJs);
    server->on("/ui/entries/pages/devices/_page.svelte.js", HTTP_GET, serveEntriesPagesDevicesPageSvelteJs);
    server->on("/ui/entries/pages/fingerprints/_page.svelte.js", HTTP_GET, serveEntriesPagesFingerprintsPageSvelteJs);
    server->on("/ui/entries/pages/settings/_page.svelte.js", HTTP_GET, serveEntriesPagesSettingsPageSvelteJs);
    server->on("/ui/chunks/index.js", HTTP_GET, serveChunksIndexJs);
    server->on("/ui/app/immutable/assets/index.Dwd10Ur_.css", HTTP_GET, serveAppImmutableAssetsIndexDwd10UrCss);
    server->on("/ui/favicon.svg", HTTP_GET, serveFaviconSvg);

    // HTML routes

}
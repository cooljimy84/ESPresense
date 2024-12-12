/*
 * Web UI Routes
 *
 * Compressed Size Summary:
 * ui_app_immutable_assets_css: 3,904 bytes
 * ui_app_immutable_chunks_js: 39,189 bytes
 * ui_app_immutable_entry_js: 212 bytes
 * ui_app_immutable_nodes_js: 449 bytes
 * ui_svg: 456 bytes
 * Total: 44,210 bytes
 */

#pragma once

#include <ESPAsyncWebServer.h>
#include "ui_app_immutable_assets_css.h"
#include "ui_app_immutable_chunks_js.h"
#include "ui_app_immutable_entry_js.h"
#include "ui_app_immutable_nodes_js.h"
#include "ui_svg.h"

inline void setupRoutes(AsyncWebServer* server) {
    server->on("/ui/app/immutable/assets/index.B4D-OeO4.css", HTTP_GET, serveAppImmutableAssetsIndexB4DOeO4Css);
    server->on("/ui/app/immutable/chunks/index.B1Qkb5z3.js", HTTP_GET, serveAppImmutableChunksIndexB1Qkb5z3Js);
    server->on("/ui/app/immutable/entry/start.C_dfYPXb.js", HTTP_GET, serveAppImmutableEntryStartCDfYpXbJs);
    server->on("/ui/app/immutable/entry/app.DeF6pmoQ.js", HTTP_GET, serveAppImmutableEntryAppDeF6pmoQJs);
    server->on("/ui/app/immutable/nodes/0.C_4_zPHS.js", HTTP_GET, serveAppImmutableNodes_0C_4ZPhsJs);
    server->on("/ui/app/immutable/nodes/1.jKKcNWjP.js", HTTP_GET, serveAppImmutableNodes_1JKKcNWjPJs);
    server->on("/ui/app/immutable/nodes/2.vKtzB1Dr.js", HTTP_GET, serveAppImmutableNodes_2VKtzB1DrJs);
    server->on("/ui/app/immutable/nodes/3.BqdcA3fB.js", HTTP_GET, serveAppImmutableNodes_3BqdcA3fBJs);
    server->on("/ui/app/immutable/nodes/4.BZYx7SaO.js", HTTP_GET, serveAppImmutableNodes_4BzYx7SaOJs);
    server->on("/ui/app/immutable/nodes/5.C0PuXlmp.js", HTTP_GET, serveAppImmutableNodes_5C0PuXlmpJs);
    server->on("/ui/favicon.svg", HTTP_GET, serveFaviconSvg);

    // HTML routes

}
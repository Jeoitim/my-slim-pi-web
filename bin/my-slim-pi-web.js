#!/usr/bin/env node
"use strict";
if (process.argv[2] === "update") {
  console.error("Update this source checkout through Git; see docs/upstream.md. The managed Pi CLI is not changed.");
  process.exitCode = 1;
} else {
  process.env.PI_WEB_APP_NAME ||= "My Slim Pi Web";
  process.env.PI_WEB_SKIP_VERSION_CHECK ||= "1";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./pi-web.js");
}

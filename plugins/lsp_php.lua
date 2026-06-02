-- mod-version:3

local lspconfig = require "plugins.lsp.config"
local common = require "core.common"
local config = require "core.config"

local installed_path_plugin = USERDIR .. PATHSEP .. "plugins" .. PATHSEP .. "lsp_php"
local server_path = installed_path_plugin .. PATHSEP .. "package" .. PATHSEP .. "lib" .. PATHSEP .. "intelephense.js"
local node = require "libraries.nodejs"

lspconfig.intelephense.setup(common.merge({
  command = { node.path_bin, server_path, "--stdio" }
}, config.plugins.lsp_php or {}))

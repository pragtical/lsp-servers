-- mod-version:3

local lspconfig = require "plugins.lsp.config"
local common = require "core.common"
local config = require "core.config"

local installed_path = USERDIR .. PATHSEP .. "plugins" .. PATHSEP .. "lsp_bash"
  .. PATHSEP .. "bash-language-server" .. PATHSEP .. "out" .. PATHSEP .. "cli.js"
local node = require "libraries.nodejs"

lspconfig.bashls.setup(common.merge({
  command = { node.path_bin, installed_path, "start" }
}, config.plugins.lsp_bash or {}))

-- mod-version:3

local lspconfig = require "plugins.lsp.config"
local common = require "core.common"
local config = require "core.config"

local installed_path = USERDIR .. PATHSEP .. "plugins" .. PATHSEP .. "lsp_tex"

lspconfig.texlab.setup(common.merge({
  command = { installed_path .. PATHSEP .. "texlab" .. (PLATFORM == "Windows" and ".exe" or "")}
}, config.plugins.lsp_tex or {}))

-- mod-version:3

local lspconfig = require "plugins.lsp.config"
local common = require "core.common"
local config = require "core.config"
local core = require "core"

local installed_path_plugin = USERDIR .. PATHSEP .. "plugins" .. PATHSEP .. "lsp_python"
local pyright_path = installed_path_plugin .. PATHSEP .. "package" .. PATHSEP .. "langserver.index.js"

local ok, node_info = pcall(require, "libraries.nodejs")
local pyright_command

if ok then
  -- NodeJs installed with ppm, runs it.
  pyright_command = {node_info.path_bin, pyright_path, "--stdio"}
  core.log_quiet("[lsp_python]: nodejs library found, using it to launch Pyright.")
else
  -- NodeJs not installed with ppm, tries to use the system path variable.
  pyright_command = {"node", pyright_path, "--stdio"}
  core.log_quiet("[lsp_python]: nodejs library not found, trying to use the 'node' path variable.")
end

local plugin_config = config.plugins.lsp_python or {}
local pyright_config = plugin_config.pyright or plugin_config
local ruff_config = plugin_config.ruff or {}

if plugin_config.pyright ~= nil or plugin_config.ruff ~= nil then
  pyright_config = plugin_config.pyright or {}
end

if plugin_config.pyright ~= false then
  lspconfig.pyright.setup(common.merge({
    command = pyright_command
  }, pyright_config))
end

if plugin_config.ruff ~= false then
  local ruff_path
  if PLATFORM == "Windows" then
    ruff_path = installed_path_plugin .. PATHSEP .. "ruff.exe"
  else
    local ruff_target
    if ARCH == "aarch64-darwin" then
      ruff_target = "ruff-aarch64-apple-darwin"
    elseif ARCH == "x86_64-darwin" then
      ruff_target = "ruff-x86_64-apple-darwin"
    else
      ruff_target = "ruff-x86_64-unknown-linux-gnu"
    end
    ruff_path = installed_path_plugin .. PATHSEP .. ruff_target .. PATHSEP .. "ruff"
  end

  lspconfig.ruff.setup(common.merge({
    command = { ruff_path, "server" }
  }, ruff_config))
end

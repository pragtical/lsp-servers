USERDIR = assert(arg[1], "user directory required")
ARCH = arg[2] or "x86_64-linux"
PLATFORM = ARCH:match("windows$") and "Windows" or ARCH:match("darwin$") and "Mac OS X" or "Linux"
PATHSEP = PLATFORM == "Windows" and "\\" or "/"

local commands = {}
local current_id
local function record(options, key)
  commands[#commands + 1] = {
    id = current_id, key = key or options.name, command = options.command,
    env = options.env, init_options = options.init_options, settings = options.settings
  }
end

package.preload["core.config"] = function() return { plugins = {} } end
package.preload["core"] = function() return { log_quiet = function() end } end
package.preload["core.common"] = function()
  return { merge = function(defaults, overrides)
    for key, value in pairs(overrides) do defaults[key] = value end
    return defaults
  end }
end
package.preload["plugins.lsp"] = function() return { add_server = record } end
package.preload["plugins.lsp.config"] = function()
  return setmetatable({}, { __index = function(_, key)
    return { setup = function(options) record(options, key) end }
  end })
end
for _, name in ipairs { "nodejs", "golang", "haxe", "jdk" } do
  package.preload["libraries." .. name] = function()
    return dofile("libraries/" .. name .. ".lua")
  end
end

local function encode(value)
  if type(value) == "string" then
    return '"' .. value:gsub('[%z\1-\31\\"]', function(char)
      return char == '"' and '\\"' or char == '\\' and '\\\\'
        or string.format('\\u%04x', char:byte())
    end) .. '"'
  elseif type(value) == "table" then
    local items = {}
    if #value > 0 then
      for _, item in ipairs(value) do items[#items + 1] = encode(item) end
      return "[" .. table.concat(items, ",") .. "]"
    end
    for key, item in pairs(value) do items[#items + 1] = encode(key) .. ":" .. encode(item) end
    return "{" .. table.concat(items, ",") .. "}"
  end
  return value == nil and "null" or tostring(value)
end

for index = 3, #arg do
  current_id = arg[index]
  dofile("plugins/" .. current_id .. ".lua")
end
io.write(encode(commands), "\n")

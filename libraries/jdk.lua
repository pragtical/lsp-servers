local info = {}

info.version = "jdk-25.0.5+8"
info.path_lib = USERDIR .. PATHSEP .. "libraries" .. PATHSEP .. "jdk"
info.path_home = info.path_lib .. PATHSEP .. info.version
if PLATFORM == "Mac OS X" then
  info.path_home = info.path_home .. PATHSEP .. "Contents" .. PATHSEP .. "Home"
end
info.path_bin = info.path_home .. PATHSEP .. "bin" .. PATHSEP .. "java" .. (PLATFORM == "Windows" and ".exe" or "")

return info

# Packaging Dependency Locks

These npm lockfiles record the dependency trees used to validate the named
server releases. Packaging workflows select a lockfile by server and version.
Bash and YAML use `npm ci` for their production dependencies. Emmet and the
VS Code servers reuse their locks when installing the pinned build tools.

When updating a server, run its workflow build commands locally with the
configured Node version and retain the generated `package-lock.json` here.
Save the VS Code locks before the workflow removes its build tools. Rebuild
from the saved lock and compare archive checksums before changing the manifest.

Runtime archives must exclude generated compiler caches. In particular, ncc's
bytecode caches vary between builds, so the VS Code workflow removes ncc before
packaging its external dependencies.

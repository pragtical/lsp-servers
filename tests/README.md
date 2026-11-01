# Language Server Smoke Tests

Run from the repository root against packages extracted into an isolated
Pragtical user directory:

```sh
node tests/smoke-lsp.mjs /path/to/userdir
node tests/smoke-lsp.mjs /path/to/userdir lsp_python lsp_json
```

The suite uses Lua to load the actual helper plugins and runtime libraries,
then launches their configured commands. Each server must initialize and return
nonempty document symbols, completions, or diagnostics for a small workspace.
Both Pyright and Ruff are checked. Servers are shut down after each test.

Node and Lua must be available to run the harness. The user directory must
contain each selected addon and its bundled runtimes. Rust project analysis
also uses the installed Rust toolchain. Workspaces, stderr, notifications, and
a JSON report are written to a temporary directory printed at completion.

Set `LSP_TEST_WORKDIR` to retain reports at a chosen location. Set
`LSP_TEST_SCHEMASTORE=1` to additionally verify online SchemaStore association
for `package.json`.

Linux ARM64 packages can also be checked with QEMU using `LSP_TEST_ARCH`,
`LSP_TEST_QEMU`, and `LSP_TEST_SYSROOT`. QEMU does not emulate kernel binfmt
registration: servers that launch ARM64 child executables need native ARM64
or a configured binfmt interpreter for a complete test.

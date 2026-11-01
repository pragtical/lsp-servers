This directory contains patches to add the following functionality to `vscode-json-languageserver`:

* Automatic download of JSON schemas from schemastore.org

The patch targets VS Code 1.144.0. It loads the SchemaStore catalog after LSP
initialization through the server's existing HTTP service, preserving proxy
configuration and the standard schema-association handling. Catalog failures
are logged without preventing the server from serving other requests.

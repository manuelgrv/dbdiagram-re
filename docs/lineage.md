# DBML parser and lineage

The 0.4.0 manifest declares `@dbml/core` 10.1.1. The parser harness loads the actual bundled parser and calls its `dbmlv2` mode. It does not approximate DBML with regular expressions.

## Normalized representation

Collections include `database`, `schemas`, `tables`, `fields`, `refs`, `endpoints`, `deps`, `depEdges`, `tableGroups`, `notes`, `indexes`, `records`, and related collections. Each is keyed by generated IDs. The exported artifacts show the complete representation of the current retail model.

A dependency definition stores its name, color, note, metadata, and edge IDs. Each edge stores its parent `depId`, upstream/downstream endpoint descriptions, table IDs, and arrays of field IDs. Empty field arrays mean a table endpoint. One empty side means a mixed-level edge.

- Table to table: pipeline dependency.
- Column to column: mapped value dependency.
- Table to column or column to table: mixed-level dependency, such as a filtering field affecting a target table.

`Ref` is represented separately with cardinality-bearing endpoints. It is not used by this project's lineage traversal.

## Actual compiler constraints

The included tests reproduce the error that started this investigation: all edges in a named `Dep` block must be at the same endpoint level in the installed parser. Mixing `a -> b` with `a.id -> b.id` in one block fails. The compiler also resolves endpoint names and rejects missing endpoints. Definitions may reference objects declared later; hand-written order checks are not a substitute for compiler validation.

The current retail model uses separate table dependencies, column-only named transformation blocks, and separate mixed-level filtering dependencies. It parses to 19 tables, 15 foreign keys, 42 dependency declarations, and 129 lineage edges.

## Tracing and exports

```sh
npm run model
node src/cli.mjs trace ../retail_lineage.dbml reporting.daily_revenue.net_revenue upstream
node src/cli.mjs trace ../retail_lineage.dbml source.refunds.amount downstream
```

The upstream trace of daily net revenue follows eight column edges to quantity, unit price, line discount, and refund amount at the source. Traversal uses visited sets and terminates on cycles. Exact endpoint matching keeps table-level provenance separate from value-level provenance. The current graph CLI assumes ordinary schema-qualified table and field names and single-column dependency endpoints; quoted names containing dots or composite column endpoints need a structured endpoint encoding before tracing.

The `.dot` export collapses dependency edges into a table-level pipeline for Graphviz. It is a derived view of explicit dependencies, not inferred SQL lineage. Custom SQL metadata is preserved in the normalized JSON; DBML does not run those queries.

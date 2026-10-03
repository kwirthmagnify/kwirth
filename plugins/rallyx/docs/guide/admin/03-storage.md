# Where scores are stored

The high-scores table is persisted in a Kubernetes **ConfigMap** in the cluster where Kwirth runs.

## ConfigMap

- **Key**: `rallyx-scores`
- **Format**: JSON array of score entries
- **Max entries**: 10 (sorted by score descending)

Each entry:

```json
{
  "name": "player1",
  "score": 12345,
  "level": 3,
  "date": "2026-10-03T12:00:00.000Z"
}
```

## Sanitization

The backend sanitizes all entries:

- `name`: trimmed to max 24 characters, control characters removed
- `score`: must be a positive number
- `level`: must be a non-negative number
- `date`: set by the backend (client-supplied dates are ignored)

## Shared table

The table is **shared** across all users of the Kwirth instance. There is no per-user or
per-workspace table.

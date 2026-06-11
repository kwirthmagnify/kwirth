# kwirth-sender-ratelimit

Rate limit filter sender for Kwirth. Used as an intermediate node in composite pipelines to control the delivery rate of messages.

## How it works

Messages arriving at the ratelimit node are counted within a fixed time window. While the count is below the configured limit, messages are forwarded immediately to the next node. Once the limit is exceeded, messages are queued and delivered at the start of the next window.

## Configuration

| Field    | Type                          | Description                          |
|----------|-------------------------------|--------------------------------------|
| name     | string                        | Config name                          |
| limit    | number                        | Max messages allowed per window      |
| interval | number                        | Window size (in `unit` units)        |
| unit     | `sec` \| `min` \| `hour` \| `day` | Time unit for the window         |

## Example

```json
{
  "name": "max-5-per-minute",
  "limit": 5,
  "interval": 1,
  "unit": "min"
}
```

Allows up to 5 messages per minute. Messages 6, 7, … are queued and flushed at the start of the next minute window.

## Usage in composite pipeline

Add a `ratelimit` node in the composite pipeline designer, referencing a ratelimit config. Chain it to any other intermediate node or a ref (output sender).

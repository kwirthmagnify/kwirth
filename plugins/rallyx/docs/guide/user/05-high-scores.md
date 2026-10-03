# High scores

## The table

Rally-X keeps a high-scores table with the top 10 entries. The table is:

- **Shared** across all users of the Kwirth instance
- **Persisted** in a Kubernetes ConfigMap (see [Storage](../admin/03-storage.md))
- **Loaded** when the channel starts

## Saving your score

When your game ends, if your score qualifies for the top 10:

1. A **High scores** panel appears over the game area
2. Your score and the current table are shown
3. Click **Save** to submit your score under your username

## Notification on record

If a sender is configured in the setup dialog, beating the #1 record triggers a notification
through that sender. This is optional — by default, no notification is sent.

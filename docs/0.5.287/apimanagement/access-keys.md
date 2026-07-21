# API Keys, Access Keys and Resource Id
The union of key type (permanent, volatile or bearer), the scope (view, snapshot, restart...), zero or more namespaces, zero or more groups (including its type and name), zero or more pods and zero or more container names *is what we call an **ACCESS KEY***.

When we talk about Access Keys we need to explain its content deeply. This is what an Access Key contains:
  - A unique Id (a UUID) identifying the access key uniquely.
  - A type of key (permanent, volatile or bearer)
  - A scope and a set of one or more resource identifiers:
    - **Scope** points to the kind of actions the access key owner can perform: view logs, restart pods, manage apis, receive metrics...
    - **Resource id** is a spec of the resources that the access key owner can work with (according to the previously explained scope) by using this access key.

And, finally... What the hell is an API Key? An API Key is an Access Key with added time (expiry) information. All this stuff is clear if you just take a look at how the data structures are defined:

```typescript
export interface ApiKey {
    accessKey: AccessKey
    description: string
    expire: number
    days: number
}
```

```typescript
class AccessKey {
    public id:string=''
    public type:string='volatile'
    public resources:string=''
}
```

```typescript
interface ResourceIdentifier {
    scopes:string,
    namespaces:string,
    groups:string,
    pods:string,
    containers:string
}
```

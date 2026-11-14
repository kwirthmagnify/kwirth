# Generate a field with AI

Some configuration fields hold something you would normally have to **write** — a script, a template,
an expression. When the extension allows it, those fields carry an **AI button** (🤖, top right of the
field): you describe in plain words what you want, and an LLM drafts the value for you.

> **The AI only writes the text.** It is called with no tools: it does not run, test or connect to
> anything, and it never sees the result of anything. What it writes **replaces the field's content
> without saving**; nothing happens until you review it and press **Save** in the configuration dialog.

## Before you start

You need **at least one LLM configured in Kwirth** (☰ → AI → LLMs). With none, the AI button is still
there but **disabled**, and its tooltip says why.

## Step by step

1. Open the extension's configuration (☰ → Manage extensions → *family* → the extension → configure) and
   select or create a configuration.
2. Fill in the **other** fields first — the interpreter, the target and so on. The AI receives them as
   context, so a script comes out in the shell you chose.
3. Press the **AI button** on the field. The *Generate with AI* dialog opens:
   - **LLM** — which of your configured LLMs to use.
   - **Describe what you want** — in natural language, e.g. *"when an alarm arrives, POST its text to
     https://hooks.example/alarm"*. If the field already has content, the AI sees it too, so you can also
     ask for a change: *"also log the HTTP status to stderr"*.
4. Press **Generate**. When it answers, the dialog closes and the text is in the field.
5. **Read it.** Change whatever you need, and only then press **Save**. Cancel discards it.

If the LLM fails, the error is shown in the dialog and the field is left untouched. If the LLM has hit
its **usage limit** (☰ → AI → usage), the dialog says exactly that.

## What the AI receives — and what it never does

| goes to the LLM | never goes to the LLM |
|---|---|
| what the extension says about the field (its contract: what the value is and how it must look) | any **password** field |
| the current value of the **other** fields of the form | any field marked **secret** (e.g. an SSH private key) |
| the field's current content, if it is not secret | |
| your description | |

Secrets are left out **twice**: the browser does not send them, and the core drops them again before
building the request to the model.

Every call counts against the usage limits of the LLM you pick, like any other AI call in Kwirth.

## Be careful with what it writes

An LLM can be wrong: it can invent options, misread your intent or write something destructive. When the
field is a **script that Kwirth will run** (the [script sender](senders/index), for instance), treat what
it gives you as a draft: read it, and try it with [Sender Debug](plugins/sender-debug) before you connect
it to anything real.

## For extension authors

A field gets the AI button by declaring `aiInstructions` in its schema — see
[Field types](../../senders/developing.md#field-types).

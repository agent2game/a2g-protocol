# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub: **Security → Report a vulnerability** on this repository.

Include what is affected (the specification, the schema or the website), how to reproduce it, and the impact you expect. We aim to acknowledge reports within a few days.

## Scope

- **Protocol and specification**: design flaws that let a client spoof sessions, forge decisions or reports, poison memory or the shared cache, read other sessions' data, or abuse a decision service. The threat model is in [the Security specification](https://agent2game.org/specification/security/).
- **JSON Schema**: constraints that let invalid or dangerous messages through.
- **agent2game.org**: the documentation website.

Vulnerabilities in a specific SDK, decision service or game belong to that project's repository.

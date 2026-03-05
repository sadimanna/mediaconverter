# Security Policy

## Supported Versions

The following versions of MediaConverter currently receive security updates.

| Version | Supported |
|--------|-----------|
| Latest release | ✅ Yes |
| Older releases | ❌ No |

Users are strongly encouraged to always use the **latest release**.

---

## Reporting a Vulnerability

If you discover a security vulnerability in MediaConverter, please report it responsibly.

Do **not** open a public GitHub issue for security vulnerabilities.

Instead, report the issue privately.

Please include the following information in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Example input files if relevant
- Suggested mitigation (if available)

---

## Responsible Disclosure

We request that security researchers follow responsible disclosure practices:

1. Report vulnerabilities privately.
2. Allow time for the issue to be investigated and fixed.
3. Avoid public disclosure until a fix is released.

We aim to acknowledge valid reports and provide updates on the fix timeline.

---

## Security Considerations

MediaConverter processes user-provided media files. Malicious media inputs may attempt to exploit underlying libraries such as FFmpeg.

Users should:

- Use the latest version of FFmpeg
- Avoid running the tool on untrusted media in sensitive environments
- Run the application with standard user privileges

---

## Dependency Security

MediaConverter relies on external libraries and tools. Security updates may depend on upstream projects.

If a vulnerability is discovered in a dependency, we will update the dependency version as soon as possible.

---

## Acknowledgements

We appreciate the efforts of security researchers who responsibly disclose vulnerabilities and help improve the security of this project.

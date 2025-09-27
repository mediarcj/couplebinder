Detechify
Building detechify.com

A web application project.

Planned Structure:
detechify/
├── package.json (private workspace root)
├── package-lock.json (single lockfile)
├── README.md
├── docs/
├── server/
│   ├── package.json (server dependencies)
│   ├── app.js
│   ├── routes/
│   └── middleware/
├── frontend/
│   ├── package.json (frontend dependencies)
│   ├── public/
│   └── src/
└── .gitignore
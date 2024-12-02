const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// Database setup
const db = new sqlite3.Database('database.sqlite'); // Persistent database

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        username TEXT UNIQUE, 
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS data (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        user_id INTEGER, 
        content TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'mySecretKey',
    resave: false,
    saveUninitialized: true
}));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
        if (err) return res.status(500).send('Internal Server Error');
        if (user) {
            req.session.user = user;
            res.redirect('/dashboard');
        } else {
            res.redirect('/login?error=invalid_credentials');
        }
    });
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], (err) => {
        if (err) {
            res.redirect('/register?error=user_exists');
        } else {
            res.redirect('/login');
        }
    });
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    db.all("SELECT * FROM data WHERE user_id = ?", [req.session.user.id], (err, rows) => {
        if (err) return res.status(500).send('Internal Server Error');

        // Generate the HTML with user data dynamically
        let dataItems = rows.map(row => `<li>${row.content} 
            <form action="/delete/${row.id}" method="post" style="display:inline;">
                <button type="submit">Delete</button>
            </form>
            <a href="/edit/${row.id}">Edit</a>
        </li>`).join('');

        const dashboardHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="/styles.css">
            <title>Dashboard</title>
            <style>
                /* General styling for the buttons container */
                .page-buttons {
                    display: flex; /* Aligns buttons horizontally */
                    justify-content: center; /* Centers the buttons */
                    gap: 1rem; /* Adds space between buttons */
                    margin: 2rem 0; /* Adds space above and below the button group */
                }

                /* General button/link styles */
                .page-buttons a {
                    text-decoration: none; /* Removes underline from links */
                    padding: 0.75rem 1.5rem; /* Adds padding around text */
                    background-color: #6200ea; /* Sets background color */
                    color: white; /* Sets text color */
                    font-weight: bold; /* Makes text bold */
                    border-radius: 5px; /* Rounds button corners */
                    transition: background-color 0.3s, transform 0.3s; /* Smooth hover effects */
                    font-size: 1rem; /* Adjusts text size */
                }

                /* Hover effect for buttons */
                .page-buttons a:hover {
                    background-color: #3700b3; /* Darkens background on hover */
                    transform: scale(1.05); /* Slightly enlarges button on hover */
                }

                /* Responsive styling for small screens */
                @media (max-width: 600px) {
                    .page-buttons {
                        flex-direction: column; /* Stacks buttons vertically */
                        align-items: center; /* Centers buttons */
                    }
                    
                    .page-buttons a {
                        width: 100%; /* Buttons take full width */
                        text-align: center; /* Centers text */
                    }
                }
            </style>
        </head>
        <body>
        <header>
            <h1>Welcome, ${req.session.user.username}!</h1>
            <nav>
                <a href="/create">Create Data</a> | <a href="/logout">Logout</a>
            </nav>
        </header>
        <main>
            <h2>Quick Navigation</h2>
            <div class="page-buttons">
                <a href="/about">About</a>
                <a href="/contact">Contact Us</a>
                <a href="/faq">FAQ</a>
                <a href="/profile">Profile</a>
                <a href="/terms">Terms of Service</a>
            </div>
            <h2>Your Data</h2>
            <ul id="data-list">${dataItems}</ul>
        </main>
        <footer>
            &copy; 2024 Your Website
        </footer>
        </body>
        </html>
        `;
        res.send(dashboardHtml);
    });
});


app.get('/create', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

app.post('/create', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const { content } = req.body;
    db.run("INSERT INTO data (user_id, content) VALUES (?, ?)", [req.session.user.id, content], (err) => {
        if (err) return res.status(500).send('Internal Server Error');
        res.redirect('/dashboard');
    });
});

app.get('/edit/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const { id } = req.params;
    db.get("SELECT * FROM data WHERE id = ? AND user_id = ?", [id, req.session.user.id], (err, item) => {
        if (err || !item) {
            return res.redirect('/dashboard'); // Redirect if the item is not found
        }
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="/styles.css">
                <title>Edit Data</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                        background-color: #f4f4f9;
                        color: #333;
                    }

                    header {
                        background-color: #6200ea;
                        color: white;
                        padding: 1rem;
                        text-align: center;
                        position: sticky;
                        top: 0;
                        z-index: 1000;
                    }

                    header h1 {
                        margin: 0;
                        font-size: 2rem;
                    }

                    main {
                        padding: 2rem;
                        max-width: 600px;
                        margin: auto;
                    }

                    form {
                        background: white;
                        padding: 2rem;
                        border-radius: 8px;
                        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                        animation: fadeIn 1s ease forwards;
                        opacity: 0;
                    }

                    label {
                        display: block;
                        margin-bottom: 0.5rem;
                        font-weight: bold;
                    }

                    textarea {
                        width: 100%;
                        height: 150px;
                        padding: 0.5rem;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        resize: none;
                        font-size: 1rem;
                    }

                    button {
                        background-color: #6200ea;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        padding: 0.75rem 1.5rem;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: background-color 0.3s ease, transform 0.3s ease;
                    }

                    button:hover {
                        background-color: #3700b3;
                        transform: scale(1.05);
                    }

                    footer {
                        background-color: #6200ea;
                        color: white;
                        text-align: center;
                        padding: 1rem;
                        position: fixed;
                        bottom: 0;
                        width: 100%;
                    }

                    @keyframes fadeIn {
                        from {
                            opacity: 0;
                            transform: translateY(10px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                </style>
            </head>
            <body>
            <header>
                <h1>Edit Data</h1>
            </header>
            <main>
                <form action="/edit/${id}" method="post">
                    <label for="content">Edit Content:</label>
                    <textarea id="content" name="content" required>${item.content}</textarea>
                    <button type="submit">Update</button>
                </form>
            </main>
            <footer>
                &copy; 2024 Your Website
            </footer>
            </body>
            </html>
        `);
    });
});



app.post('/edit/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const { id } = req.params;
    const { content } = req.body;
    db.run("UPDATE data SET content = ? WHERE id = ? AND user_id = ?", [content, id, req.session.user.id], (err) => {
        if (err) return res.status(500).send('Internal Server Error');
        res.redirect('/dashboard');
    });
});

app.post('/delete/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const { id } = req.params;
    db.run("DELETE FROM data WHERE id = ? AND user_id = ?", [id, req.session.user.id], (err) => {
        if (err) return res.status(500).send('Internal Server Error');
        res.redirect('/dashboard');
    });
});
app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'contact.html'));
});

app.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'faq.html'));
});

app.get('/profile', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'terms.html'));
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


const express = require("express");
const router = express.Router();
const connection = require("../config/db");

const active = 1;
const inactive = 0;

// Validate mobile number format (10 digits)
function isValidMobileNumber(mobileNumber) {
	const regex = /^\d{10}$/;
	return regex.test(mobileNumber);
}

// Validate email format using a basic regex
function isValidEmail(email) {
	const regex = /^\S+@\S+\.\S+$/;
	return regex.test(email);
}

// Function to check if mobile number is unique
async function checkIfNumberUnique(mobile_number, id = null) {
	const query = id
		? "SELECT COUNT(*) as count FROM users WHERE mobile_number = ? AND id <> ? AND active = ?"
		: "SELECT COUNT(*) as count FROM users WHERE mobile_number = ? AND active = ?";
	const params = id ? [mobile_number, id, active] : [mobile_number, active];

	try {
		const [rows] = await queryAsync(query, params);
		return rows.count === 0;
	} catch (err) {
		throw err;
	}
}

// Function to check if email is unique
async function checkIfEmailUnique(email, id = null) {
	const query = id
		? "SELECT COUNT(*) as count FROM users WHERE email = ? AND id <> ? AND active = ?"
		: "SELECT COUNT(*) as count FROM users WHERE email = ? AND active = ?";
	const params = id ? [email, id, active] : [email, active];

	try {
		const [rows] = await queryAsync(query, params);
		return rows.count === 0;
	} catch (err) {
		throw err;
	}
}

async function isUserExist(id) {
	const query =
		"SELECT COUNT(*) AS count FROM users WHERE id = ? AND active = ?";
	const params = [];
	params.push(id);
	params.push(active);

	try {
		const [rows] = await queryAsync(query, params);
		console.log(rows);
		return rows.count !== 0;
	} catch (err) {
		throw err;
	}
}

// Create User
router.post("/create", async (req, res) => {
	const { name, mobile_number, email } = req.body;
	console.log(name, mobile_number, email, typeof name, typeof mobile_number, typeof email)
	const created = Math.floor(Date.now() / 1000);
	const updated = created;

	if (!isValidMobileNumber(mobile_number)) {
		return res
			.status(400)
			.json({ message: "Mobile number must be 10 digits" });
	}

	if (!isValidEmail(email)) {
		return res.status(400).json({ message: "Invalid email format" });
	}

	// Check if mobile number is unique
	try {
		const isMobileNumberUnique = await checkIfNumberUnique(
			mobile_number
		);
		if (!isMobileNumberUnique) {
			return res
				.status(400)
				.json({ message: "Mobile number already exists" });
		}
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}

	// Check if email is unique
	try {
		const isEmailUnique = await checkIfEmailUnique(email);
		if (!isEmailUnique) {
			return res
				.status(400)
				.json({ message: "Email already exists" });
		}
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}

	// If both are unique, proceed to create user
	const query = `
        INSERT INTO users (name, mobile_number, email, active, created, updated)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

	try {
		const results = await queryAsync(query, [
			name,
			mobile_number,
			email,
			active,
			created,
			updated,
		]);
		res.status(201).json({
			message: "User created successfully",
			userId: results.insertId,
			result: results,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Update User
router.post("/update", async (req, res) => {
	const { id, name, mobile_number, email } = req.body;
	console.log(id , name, mobile_number, email, typeof id, typeof name, typeof mobile_number, typeof email)
	const userId = id || undefined;
	const userName = name || undefined;
	const userMobileNumber = mobile_number || undefined;
	const userEmail = email || undefined;
	const updated = Math.floor(Date.now() / 1000);
	const params = [];
	let query = "UPDATE users SET";

	if (
		!userId ||
		typeof userId !== "number" ||
		isNaN(userId) ||
		userId <= 0
	) {
		return res.status(400).json({ message: "missing id field" });
	}

	if (!(await isUserExist(userId)))
		return res.status(400).json({ message: "User id is Invalid" });

	if (userName != undefined) {
		params.push(userName);
		query += " name = ?";
	}

	if (userMobileNumber != undefined) {
		if (!isValidMobileNumber(userMobileNumber)) {
			return res
				.status(400)
				.json({ message: "Mobile number must be 10 digits" });
		}

		try {
			const isMobileNumberUnique = await checkIfNumberUnique(
				userMobileNumber,
				userId
			);

			if (!isMobileNumberUnique) {
				return res.status(400).json({
					message: "Mobile number already exists",
				});
			}
		} catch (err) {
			return res.status(500).json({ error: err.message });
		}

		query += params.length
			? " , mobile_number = ?"
			: " mobile_number = ?";
		params.push(userMobileNumber);
	}

	if (userEmail != undefined) {
		if (!isValidEmail(userEmail)) {
			return res
				.status(400)
				.json({ message: "Invalid email format" });
		}

		try {
			const isEmailUnique = await checkIfEmailUnique(
				userEmail,
				userId
			);
			if (!isEmailUnique) {
				return res
					.status(400)
					.json({ message: "Email already exists" });
			}
		} catch (err) {
			return res.status(500).json({ error: err.message });
		}

		query += params.length ? " , email = ?" : " email = ?";
		params.push(userEmail);
	}

	if (params.length) {
		params.push(updated);
		query += " , updated = ?";

		params.push(id);
		query += " WHERE id = ?";
	} else {
		res.status(200).json({
			message: "User updated successfully",
		});
	}

	try {
		const results = await queryAsync(query, params);
		res.status(200).json({
			message: "User updated successfully",
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Delete User
router.post("/delete", async (req, res) => {
	const { id } = req.body;
	const query = "UPDATE users SET active = ? WHERE id = ?";

	if (!id || typeof id !== "number" || isNaN(id) || id <= 0) {
		return res.status(400).json({ message: "missing id field" });
	}

	if (!(await isUserExist(id)))
		return res.status(400).json({ message: "User id is Invalid" });

	try {
		const results = await queryAsync(query, [inactive, id]);
		if (results.affectedRows === 0) {
			res.status(404).json({ message: "User not found" });
		} else {
			res.status(200).json({
				message: "User deleted successfully",
			});
		}
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Show List of Users
router.get("/getAll", async (req, res) => {
	const query = "SELECT * FROM users WHERE active = ?";

	try {
		const results = await queryAsync(query, [active]);
		res.status(200).json(results);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Search User Based on Name
router.post("/search", async (req, res) => {
	const { name } = req.body;
	const query = "SELECT * FROM users WHERE name LIKE ? AND active = ?";

	try {
		const results = await queryAsync(query, [`%${name}%`, active]);
		res.status(200).json(results);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Helper function to promisify connection.query
function queryAsync(sql, values) {
	return new Promise((resolve, reject) => {
		connection.query(sql, values, (err, results) => {
			if (err) {
				reject(err);
			} else {
				resolve(results);
			}
		});
	});
}

module.exports = { router, isUserExist, queryAsync };

const express = require("express");
const router = express.Router();
const { uploadFileToDrive, deleteFileFromDrive } = require("../googleDrive");
const { isUserExist, queryAsync } = require("./users");
const path = require("path");
const fs = require("fs");
const fileUpload = require("express-fileupload");

const active = 1;
const inactive = 0;

router.use(fileUpload());

async function checkIfBlogExist(blog_id) {
	const existingBlog = await queryAsync(
		"SELECT * FROM blog WHERE id = ? AND active = ?",
		[blog_id, active]
	);

	return existingBlog.length ?? 0;
}

async function IsUserBlogOwner(blog_id, user_id) {
	const query =
		"SELECT count(*) FROM blog WHERE id = ? AND user_id = ? AND active = ?";
	const isOwner = await queryAsync(query, [blog_id, user_id, active]);

	return isOwner.length ?? 0;
}

async function deleteTags(blogId) {
	try {
		await queryAsync("DELETE FROM tag WHERE blog_id = ?", [blogId]);
		console.log(`Tags for blog ID ${blogId} deleted successfully.`);
	} catch (err) {
		throw new Error(`Failed to delete tags: ${err.message}`);
	}
}

async function deleteImage(imageId) {
	try {
		const imageData = await queryAsync(
			"SELECT * FROM google_drive_images WHERE id = ?",
			[imageId]
		);
		if (imageData.length === 0) {
			throw new Error("Image data not found");
		}
		await deleteFileFromDrive(imageData[0].image_id, imageId);
	} catch (err) {
		throw new Error(`Failed to delete image: ${err.message}`);
	}
}

// Create Discussion
router.post("/create", async (req, res) => {
	const { user_id, text_field, tags } = req.body;
	const created = Math.floor(Date.now() / 1000);
	const updated = created;
	const tagsArray = tags.split(",");

	if (!text_field) {
		return res.status(400).send({ error: "Text field is required." });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });

	let imageId = null;
	if (req.files && req.files.image) {
		let imageFile = req.files.image;
		let uploadPath = path.join(
			__dirname,
			"../uploads/",
			imageFile.name
		);

		// Move the file to the upload directory
		await imageFile.mv(uploadPath);

		try {
			const uploadResult = await uploadFileToDrive(
				uploadPath,
				imageFile.mimetype
			);
			imageId = uploadResult;

			// Delete the local file after uploading to Google Drive
			fs.unlinkSync(uploadPath);
		} catch (err) {
			return res.status(500).json({ error: err.message });
		}
	}

	try {
		const query = `
            INSERT INTO blog (user_id, text_field, image, active, created, updated)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

		const results = await queryAsync(query, [
			user_id,
			text_field,
			imageId,
			active,
			created,
			updated,
		]);

		const blogId = results.insertId;

		// Insert tags into the tag table
		if (tagsArray && Array.isArray(tagsArray)) {
			const tagInsertQueries = tagsArray.map((tag) => {
				return queryAsync(
					`INSERT INTO tag (tag, blog_id, active, created, updated) VALUES (?, ?, ?, ?, ?)`,
					[tag, blogId, active, created, updated]
				);
			});

			await Promise.all(tagInsertQueries);
		}

		res.status(201).json({
			message: "Discussion created successfully",
			discussionId: blogId,
			userId: user_id,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Update Discussion
router.post("/update", async (req, res) => {
	const { user_id, blog_id, text_field, tags } = req.body;
	const updated = Math.floor(Date.now() / 1000);
	let params = [];
	let updateQuery = "UPDATE blog SET";
	let imageId = "";

	if (!user_id)
		return res.status(400).json({ message: "User Id cannot be empty" });

	if (!blog_id)
		return res.status(400).json({ message: "Blog Id cannot be empty" });

	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });

	if (!(await IsUserBlogOwner(blog_id, user_id)))
		return res.status(400).json({
			message: "User Cannot update the blog. User is not owner of blog",
		});

	try {
		// Handle image upload if new image is provided
		if (req.files && req.files.image) {
			const blogQuery =
				"SELECT * FROM blog WHERE id = ? AND active = ?";
			const blogData = await queryAsync(blogQuery, [
				blog_id,
				active,
			]);

			let newImageFile = req.files.image;
			let uploadPath = path.join(
				__dirname,
				"../uploads/",
				newImageFile.name
			);

			// Move the new file to the upload directory
			await newImageFile.mv(uploadPath);

			try {
				// Upload new image to Google Drive
				const uploadResult = await uploadFileToDrive(
					uploadPath,
					newImageFile.mimetype
				);
				imageId = uploadResult;

				// Delete the old image from Google Drive
				if (blogData[0].image) {
					await deleteImage(blogData[0].image);
				}

				// Delete the local file after uploading to Google Drive
				fs.unlinkSync(uploadPath);

			} catch (err) {
				return res.status(500).json({
					error: "Failed to upload new image to Google Drive",
					details: err.message,
				});
			}

			// Update the updateQuery and params with image path
			updateQuery += " image = ?";
			params.push(imageId);
		}

		// Check for text_field update
		if (text_field) {
			updateQuery += params.length
				? " , text_field = ?"
				: " text_field = ?";
			params.push(text_field);
		}

		// Add updated timestamp and blog_id to params
		if (params.length) {
			updateQuery += " , updated = ? WHERE id = ?";
			params.push(updated);
			params.push(blog_id);

			await queryAsync(updateQuery, params);
		}

		// Update tags if present
		if (tags) {
			let tagsArray = tags.split(",").map((tag) => tag.trim());

			await deleteTags(blog_id);

			if (tagsArray.length > 0) {
				const created = updated;

				const tagInsertQueries = tagsArray.map((tagValue) => {
					return queryAsync(
						`INSERT INTO tag (tag, blog_id, active, created, updated) VALUES (?, ?, ?, ?, ?)`,
						[
							tagValue.trim(),
							blog_id,
							active,
							created,
							updated,
						]
					);
				});

				await Promise.all(tagInsertQueries);
			}
		}

		res.status(200).json({
			message: "Discussion updated successfully",
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post("/delete", async (req, res) => {
	const { user_id, blog_id } = req.body;

	if (!user_id)
		return res.status(400).json({ message: "User Id cannot be empty" });
	if (!blog_id)
		return res.status(400).json({ message: "Blog Id cannot be empty" });

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });
	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });
	if (!(await IsUserBlogOwner(blog_id, user_id)))
		return res.status(400).json({
			message: "User Cannot delete the blog. User is not owner of blog",
		});

	try {
		const blogQuery = "SELECT * FROM blog WHERE id = ? AND active = ?";
		const blogData = await queryAsync(blogQuery, [blog_id, active]);

		// Deactivate the blog
		const deactivateBlogQuery =
			"UPDATE blog SET active = ? WHERE id = ?";
		await queryAsync(deactivateBlogQuery, [inactive, blog_id]);

		// Delete associated tags
		await deleteTags(blog_id);

		// Delete associated image if exists
		if (blogData[0].image) {
			await deleteImage(blogData[0].image);
		}

		res.status(200).json({ message: "Blog deleted successfully" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Get list of discussions based on tags
router.post("/by-tags", async (req, res) => {
	const { tags } = req.body;

	if (!tags) {
		return res.status(400).json({ message: "Tags cannot be empty" });
	}

	const tagsArray = tags.split(",").map((tag) => tag.trim());

	const query = `
          SELECT DISTINCT blog.*
          FROM blog
          JOIN tag ON blog.id = tag.blog_id
          WHERE tag.tag IN (?)
          AND blog.active = ?
      `;

	try {
		const discussions = await fetchDiscussions(query, [
			tagsArray,
			active,
		]);
		res.status(200).json({ discussions });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Get list of discussions based on certain text in the text field
router.post("/by-text", async (req, res) => {
	const { text } = req.body;

	if (!text) {
		return res.status(400).json({ message: "Text cannot be empty" });
	}

	const query = `
          SELECT * FROM blog
          WHERE text_field LIKE ?
          AND active = ?
      `;

	try {
		const discussions = await fetchDiscussions(query, [
			`%${text}%`,
			active,
		]);
		res.status(200).json({ discussions });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

async function fetchDiscussions(query, params) {
	try {
		const discussions = await queryAsync(query, params);

		for (let discussion of discussions) {
			// Fetch tags
			const tagsQuery = `
                  SELECT tag FROM tag WHERE blog_id = ? AND active = ?
              `;
			const tags = await queryAsync(tagsQuery, [
				discussion.id,
				active,
			]);
			discussion.tags = tags.map((tag) => tag.tag);

			// Fetch image web view link if image exists
			if (discussion.image) {
				const imageQuery = `
                      SELECT web_view_link FROM google_drive_images WHERE id = ?
                  `;
				const image = await queryAsync(imageQuery, [
					discussion.image,
				]);
				discussion.image_web_view_link = image.length
					? image[0].web_view_link
					: null;
			} else {
				discussion.image_web_view_link = null;
			}
		}

		return discussions;
	} catch (err) {
		throw new Error(`Failed to fetch discussions: ${err.message}`);
	}
}

router.post("/like", async (req, res) => {
	const { user_id, blog_id } = req.body;
	const created = Math.floor(Date.now() / 1000);
	const updated = created;

	if (!user_id || !blog_id) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });
	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	// Check if the user has already liked this post
	const existingLikeQuery = `
          SELECT COUNT(*) as count
          FROM post_likes
          WHERE user_id = ? AND blog_id = ? AND active = ?
      `;

	const existingLikeResult = await queryAsync(existingLikeQuery, [
		user_id,
		blog_id,
		active,
	]);

	if (existingLikeResult[0].count > 0) {
		return res
			.status(400)
			.json({ message: "User has already liked this post" });
	}

	const insertLikeQuery = `
          INSERT INTO post_likes (user_id, blog_id, active, created, updated)
          VALUES (?, ?, ?, ?, ?)
      `;

	try {
		await queryAsync(insertLikeQuery, [
			user_id,
			blog_id,
			active,
			created,
			updated,
		]);

		const updatePostLikes = `
              UPDATE blog
              SET likes = likes + 1
              WHERE id = ?
          `;

		await queryAsync(updatePostLikes, [blog_id]);

		res.status(201).json({ message: "Post liked successfully" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post("/unlike", async (req, res) => {
	const { user_id, blog_id } = req.body;

	if (!user_id || !blog_id) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });
	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	// Check if the user has liked this post to allow unliking
	const existingLikeQuery = `
          SELECT id
          FROM post_likes
          WHERE user_id = ? AND blog_id = ? AND active = ?
      `;

	try {
		const existingLikeResult = await queryAsync(existingLikeQuery, [
			user_id,
			blog_id,
			active,
		]);

		if (existingLikeResult.length === 0) {
			return res
				.status(400)
				.json({ message: "User has not liked this post" });
		}

		const deleteLikeQuery = `
              DELETE FROM post_likes
              WHERE id = ?
          `;

		const likeId = existingLikeResult[0].id;

		await queryAsync(deleteLikeQuery, [likeId]);

		const updatePostLikes = `
              UPDATE blog
              SET likes = likes - 1
              WHERE id = ?
          `;

		await queryAsync(updatePostLikes, [blog_id]);

		res.status(200).json({ message: "Post unliked successfully" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post("/comment", async (req, res) => {
	const { user_id, blog_id, comment_text } = req.body;
	const created = Math.floor(Date.now() / 1000);

	if (!user_id || !blog_id || !comment_text) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });
	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	// Check if the user has already commented on this blog post
	const existingCommentQuery = `
          SELECT id
          FROM comment
          WHERE user_id = ? AND blog_id = ? AND active = ?
      `;

	try {
		const existingCommentResult = await queryAsync(
			existingCommentQuery,
			[user_id, blog_id, active]
		);

		if (existingCommentResult.length > 0) {
			return res.status(400).json({
				message: "User has already commented on this post",
			});
		}

		const insertCommentQuery = `
              INSERT INTO comment (user_id, blog_id, comment_text, active, created, updated)
              VALUES (?, ?, ?, ?, ?, ?)
          `;

		const results = await queryAsync(insertCommentQuery, [
			user_id,
			blog_id,
			comment_text,
			active,
			created,
			created,
		]);
		const commentId = results.insertId;

		res.status(201).json({
			message: "Comment added successfully",
			commentId: commentId,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post("/comment/reply", async (req, res) => {
	const { user_id, blog_id, comment_id, comment_text } = req.body;
	const created = Math.floor(Date.now() / 1000);

	if (!user_id || !blog_id || !comment_id || !comment_text) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });
	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	try {
		// Check if the user has already commented on this comment
		const existingReplyQuery = `
              SELECT id
              FROM comment
              WHERE user_id = ? AND comment_id = ? AND active = ?
          `;

		const existingReplyResult = await queryAsync(existingReplyQuery, [
			user_id,
			comment_id,
			active,
		]);

		if (existingReplyResult.length > 0) {
			return res.status(400).json({
				message: "User has already replied to this comment",
			});
		}

		const insertReplyQuery = `
              INSERT INTO comment (user_id, blog_id, comment_id, comment_text, active, created, updated)
              VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

		const results = await queryAsync(insertReplyQuery, [
			user_id,
			blog_id,
			comment_id,
			comment_text,
			active,
			created,
			created,
		]);
		const replyId = results.insertId;

		res.status(201).json({
			message: "Reply added successfully",
			replyId: replyId,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post("/comment/update", async (req, res) => {
	const { user_id, blog_id, comment_id, comment_text } = req.body;
	const updated = Math.floor(Date.now() / 1000);

	if (!user_id || !blog_id || !comment_id || !comment_text) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });

	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	try {
		// Check if the comment exists, if the user is the owner, and if it belongs to the specified blog
		const commentQuery = `
              SELECT id
              FROM comment
              WHERE id = ? AND user_id = ? AND blog_id = ? AND active = ?
          `;

		const commentResult = await queryAsync(commentQuery, [
			comment_id,
			user_id,
			blog_id,
			active,
		]);

		if (commentResult.length === 0) {
			return res.status(400).json({
				message: "Comment not found or you are not the owner",
			});
		}

		const updateQuery = `
              UPDATE comment
              SET comment_text = ?, updated = ?
              WHERE id = ?
          `;

		await queryAsync(updateQuery, [comment_text, updated, comment_id]);

		res.status(200).json({
			message: "Comment updated successfully",
			commentId: comment_id,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post("/comment/delete", async (req, res) => {
	const { user_id, blog_id, comment_id } = req.body;

	if (!user_id || !blog_id || !comment_id) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });

	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	try {
		// Check if the comment exists and if the user is the owner
		const commentQuery = `
            SELECT id
            FROM comment
            WHERE id = ? AND user_id = ? AND blog_id = ?
        `;
		const commentResult = await queryAsync(commentQuery, [
			comment_id,
			user_id,
			blog_id,
		]);

		if (commentResult.length === 0) {
			return res.status(400).json({
				message: "Comment not found or you are not the owner",
			});
		}

		// Delete the comment and its replies recursively
		await deleteCommentAndReplies(comment_id);

		res.status(200).json({
			message: "Comment and replies deleted successfully",
			commentId: comment_id,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

async function deleteCommentAndReplies(commentId) {
	// First, delete the comment itself
	await queryAsync("DELETE FROM comment WHERE id = ?", [commentId]);

	// Then, recursively delete all replies to this comment
	const repliesQuery = `
        SELECT id
        FROM comment
        WHERE comment_id = ?
    `;
	const replies = await queryAsync(repliesQuery, [commentId]);

	for (const reply of replies) {
		await deleteCommentAndReplies(reply.id); // Recursive call to delete replies
	}
}

// Like a comment
router.post("/comment/like", async (req, res) => {
	const { user_id, blog_id, comment_id } = req.body;

	if (!user_id || !blog_id || !comment_id) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });

	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	try {
		// Check if the user has already liked the comment
		const checkLikeQuery = `
            SELECT id
            FROM comment_likes
            WHERE user_id = ? AND comment_id = ?
        `;
		const existingLike = await queryAsync(checkLikeQuery, [
			user_id,
			comment_id,
		]);

		if (existingLike.length > 0) {
			return res.status(400).json({
				message: "You have already liked this comment",
			});
		}

		// Insert the new like
		const insertLikeQuery = `
            INSERT INTO comment_likes (user_id, comment_id, created, updated)
            VALUES (?, ?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP())
        `;
		await queryAsync(insertLikeQuery, [user_id, comment_id]);

		// Increment the likes count in the comment table
		const updateLikesQuery = `
            UPDATE comment
            SET likes = likes + 1
            WHERE id = ?
        `;
		await queryAsync(updateLikesQuery, [comment_id]);

		res.status(200).json({
			message: "Comment liked successfully",
			commentId: comment_id,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Dislike a comment
router.post("/comment/unlike", async (req, res) => {
	const { user_id, blog_id, comment_id } = req.body;

	if (!user_id || !blog_id || !comment_id) {
		return res
			.status(400)
			.json({ message: "Required fields are missing" });
	}

	if (!(await isUserExist(user_id)))
		return res.status(400).json({ message: "User id is Invalid" });

	if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	try {
		// Check if the user has already disliked the comment
		const checklikeQuery = `
            SELECT id
            FROM comment_likes
            WHERE user_id = ? AND comment_id = ? AND active = ? 
        `;
		const existinglike = await queryAsync(checklikeQuery, [
			user_id,
			comment_id,
                  active
		]);

		if (existinglike.length === 0) {
			return res.status(400).json({
				message: "User has not liked this comment",
			});
		}

		const deleteLikeQuery = `
              DELETE FROM comment_likes
              WHERE id = ?
          `;

		const likeId = existinglike[0].id;

		await queryAsync(deleteLikeQuery, [likeId]);

		// Decrement the likes count in the comment table
		const updateDislikesQuery = `
            UPDATE comment
            SET likes = likes - 1
            WHERE id = ?
        `;
		await queryAsync(updateDislikesQuery, [comment_id]);

		res.status(200).json({
			message: "Comment disliked successfully",
			commentId: comment_id,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post("/fetchComments", async (req, res) => {
	const { blog_id } = req.body;

      if (!(await checkIfBlogExist(blog_id)))
		return res.status(400).json({ message: "Blog Id is invalid" });

	try {
		const comments = await getCommentsAndRepliesForBlog(blog_id);
		res.status(200).json({ comments });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

async function getCommentsAndRepliesForBlog(blogId) {
	try {
		// Query to fetch all comments and their replies
		const query = `
              SELECT c.id AS comment_id, c.user_id AS comment_user_id, c.comment_text, 
                     c.likes AS comment_likes, c.created AS comment_created, 
                     cr.id AS reply_id, cr.user_id AS reply_user_id, cr.comment_text as reply_text, 
                     cr.likes AS reply_likes, cr.created AS reply_created
              FROM comment c
              LEFT JOIN comment cr ON cr.comment_id = c.id
              WHERE c.blog_id = ?
              ORDER BY c.id, cr.id;`;

		const rows = await queryAsync(query, [blogId]);

		const comments = [];
		let currentComment = null;

		rows.forEach((row) => {
			if (row.comment_id !== currentComment?.id) {
				currentComment = {
					id: row.comment_id,
					user_id: row.comment_user_id,
					comment_text: row.comment_text,
					likes: row.comment_likes,
					created: row.comment_created,
					replies: [],
				};
				comments.push(currentComment);
			}

			if (row.reply_id) {
				// Reply exists, add to replies array of current comment
				currentComment.replies.push({
					id: row.reply_id,
					user_id: row.reply_user_id,
					reply_text: row.reply_text,
					likes: row.reply_likes,
					created: row.reply_created,
				});
			}
		});

		return comments;
	} catch (error) {
		throw new Error(`Error fetching comments: ${error.message}`);
	}
}

module.exports = router;

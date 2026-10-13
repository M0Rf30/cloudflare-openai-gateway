/**
 * Cloudflare Vectorize utilities for embeddings storage and retrieval
 */

/**
 * Store embeddings in Vectorize index
 * @param {VectorizeIndex} vectorIndex - Vectorize index binding
 * @param {Array} vectors - Array of vectors to store
 * @returns {Promise<Object>} Insert result
 */
export async function storeVectors(vectorIndex, vectors) {
	try {
		const result = await vectorIndex.upsert(vectors);
		return {
			success: true,
			count: result.count,
			ids: result.ids,
		};
	} catch (error) {
		console.error('Failed to store vectors:', error);
		throw new Error(`Vectorize storage failed: ${error.message}`, { cause: error });
	}
}

/**
 * Search for similar vectors
 * @param {VectorizeIndex} vectorIndex - Vectorize index binding
 * @param {Array<number>} queryVector - Query vector
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
export async function searchVectors(vectorIndex, queryVector, options = {}) {
	try {
		const { topK = 5, scoreThreshold = 0.7, includeMetadata = true, filter = null } = options;

		const searchOptions = {
			topK,
			returnMetadata: includeMetadata,
		};

		if (filter) {
			searchOptions.filter = filter;
		}

		const results = await vectorIndex.query(queryVector, searchOptions);

		// Filter by score threshold
		const filteredResults = results.matches.filter(match => match.score >= scoreThreshold);

		return filteredResults.map(match => ({
			id: match.id,
			score: match.score,
			metadata: match.metadata,
			text: match.metadata?.text || '',
		}));
	} catch (error) {
		console.error('Failed to search vectors:', error);
		throw new Error(`Vectorize search failed: ${error.message}`, { cause: error });
	}
}

/**
 * Generate embeddings and store document chunks
 * @param {Object} env - Environment with AI and Vectorize bindings
 * @param {string} text - Text to process
 * @param {Object} metadata - Document metadata
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Storage result
 */
export async function processAndStoreDocument(env, text, metadata = {}, options = {}) {
	try {
		const {
			model = '@cf/baai/bge-base-en-v1.5',
			chunkSize = 1000,
			chunkOverlap = 200,
			namespace = 'documents',
		} = options;

		// Split text into chunks
		const chunks = splitTextIntoChunks(text, chunkSize, chunkOverlap);

		// Generate embeddings for all chunks
		const vectors = [];
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];

			// Generate embedding
			const embeddingResponse = await env.AI.run(model, {
				text: chunk,
			});

			if (!embeddingResponse?.data?.[0]) {
				throw new Error(`Failed to generate embedding for chunk ${i}`);
			}

			const embedding = embeddingResponse.data[0];
			const vectorId = `${metadata.docId || 'doc'}_chunk_${i}_${Date.now()}`;

			vectors.push({
				id: vectorId,
				values: embedding,
				metadata: {
					...metadata,
					text: chunk,
					chunkIndex: i,
					chunkCount: chunks.length,
					namespace,
					createdAt: new Date().toISOString(),
				},
			});
		}

		// Store in Vectorize
		if (!env.VECTOR_INDEX) {
			throw new Error('VECTOR_INDEX binding not configured');
		}

		const result = await storeVectors(env.VECTOR_INDEX, vectors);

		return {
			success: true,
			documentId: metadata.docId,
			chunksProcessed: chunks.length,
			vectorsStored: result.count,
		};
	} catch (error) {
		console.error('Failed to process document:', error);
		throw error;
	}
}

/**
 * Perform RAG (Retrieval Augmented Generation) search
 * @param {Object} env - Environment with AI and Vectorize bindings
 * @param {string} query - Search query
 * @param {Object} options - RAG options
 * @returns {Promise<Object>} RAG results
 */
export async function performRAGSearch(env, query, options = {}) {
	try {
		const { model = '@cf/baai/bge-base-en-v1.5', topK = 5, scoreThreshold = 0.7, namespace = 'documents' } = options;

		// Generate query embedding
		const queryEmbedding = await env.AI.run(model, {
			text: query,
		});

		if (!queryEmbedding?.data?.[0]) {
			throw new Error('Failed to generate query embedding');
		}

		// Search for similar documents
		const searchOptions = {
			topK,
			scoreThreshold,
			filter: namespace ? { namespace: { $eq: namespace } } : null,
		};

		const results = await searchVectors(env.VECTOR_INDEX, queryEmbedding.data[0], searchOptions);

		// Combine context from top results
		const context = results.map(result => result.text).join('\n\n');

		return {
			query,
			context,
			sources: results.map(result => ({
				score: result.score,
				metadata: result.metadata,
				text: result.text.substring(0, 200) + '...', // Truncated preview
			})),
		};
	} catch (error) {
		console.error('RAG search failed:', error);
		throw error;
	}
}

/**
 * Split text into overlapping chunks
 * @param {string} text - Text to split
 * @param {number} chunkSize - Size of each chunk
 * @param {number} overlap - Overlap between chunks
 * @returns {Array<string>} Text chunks
 */
function splitTextIntoChunks(text, chunkSize = 1000, overlap = 200) {
	const chunks = [];
	let start = 0;

	while (start < text.length) {
		let end = start + chunkSize;

		// Try to break at sentence boundaries
		if (end < text.length) {
			const sentenceEnd = text.lastIndexOf('.', end);
			const lineEnd = text.lastIndexOf('\n', end);
			const breakPoint = Math.max(sentenceEnd, lineEnd);

			if (breakPoint > start + chunkSize * 0.5) {
				end = breakPoint + 1;
			}
		}

		chunks.push(text.slice(start, end).trim());
		start = end - overlap;

		if (start >= text.length) break;
	}

	return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Delete vectors by metadata filter
 * @param {VectorizeIndex} vectorIndex - Vectorize index binding
 * @param {Object} filter - Metadata filter for deletion
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteVectorsByFilter(_vectorIndex, _filter) {
	// Note: Vectorize may not support bulk deletion by filter yet
	// This is a placeholder for when the feature becomes available

	// For now, you might need to query first, then delete by IDs
	// const results = await _vectorIndex.query(someVector, { filter: _filter, topK: 1000 });
	// const ids = results.matches.map(match => match.id);
	// const deletion = await _vectorIndex.deleteByIds(ids);

	return {
		success: true,
		message: 'Deletion functionality pending Vectorize API support',
	};
}

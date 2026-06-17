// leetcode/graphql.js
// All queries against LeetCode's public GraphQL API.

const LC_GRAPHQL_URL = 'https://leetcode.com/graphql';

/**
 * Fetch problem statement HTML for a given titleSlug.
 * Returns: { title, content, difficulty }
 */
async function fetchProblemStatement(titleSlug) {
  const query = `
    query getProblem($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        difficulty
        content
      }
    }
  `;
  const res = await fetch(LC_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { titleSlug } }),
  });
  const { data } = await res.json();
  return data.question;
}

/**
 * Fetch the official editorial for a problem.
 * Returns: content string (Markdown), or null if Premium-locked.
 */
async function fetchOfficialEditorial(titleSlug) {
  const query = `
    query getEditorial($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        solution {
          content
        }
      }
    }
  `;
  const res = await fetch(LC_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { titleSlug } }),
  });
  const { data } = await res.json();
  return data.question?.solution?.content ?? null;
}

/**
 * Fallback: fetch top community solution when official editorial is null.
 * Returns: content string (Markdown).
 */
async function fetchTopCommunitySolution(titleSlug) {
  const listQuery = `
    query getCommunitySolutions($titleSlug: String!) {
      communitySolutions(
        questionSlug: $titleSlug,
        first: 1,
        skip: 0,
        orderBy: hot,
        query: ""
      ) {
        solutions {
          id
        }
      }
    }
  `;
  // Using the exact user-verified format for communitySolutions
  const userVerifiedQuery = `query communitySolutions($questionSlug: String!, $skip: Int!, $first: Int!, $query: String, $orderBy: TopicSortingOption, $languageTags: [String!], $topicTags: [String!]) { questionSolutions(filters: {questionSlug: $questionSlug, skip: $skip, first: $first, query: $query, orderBy: $orderBy, languageTags: $languageTags, topicTags: $topicTags}) { solutions { id } } }`;
  
  const listRes = await fetch(LC_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      query: userVerifiedQuery, 
      variables: { questionSlug: titleSlug, skip: 0, first: 1, orderBy: "hot", query: "", languageTags: [], topicTags: [] } 
    }),
  });
  const listData = await listRes.json();
  const topicId = listData.data?.questionSolutions?.solutions?.[0]?.id;

  if (!topicId) return null;

  const contentQuery = `
    query communitySolution($topicId: Int!) {
      topic(id: $topicId) {
        post {
          content
        }
      }
    }
  `;
  const contentRes = await fetch(LC_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: contentQuery, variables: { topicId: parseInt(topicId) } }),
  });
  const contentData = await contentRes.json();
  return contentData.data?.topic?.post?.content ?? null;
}

/**
 * Master fetch: gets problem + best available editorial.
 * Tries official first, falls back to community.
 * Returns: { title, difficulty, problemContent, editorialContent, editorialSource }
 */
async function fetchLeetCodePayload(titleSlug) {
  const [problem, officialEditorial] = await Promise.all([
    fetchProblemStatement(titleSlug),
    fetchOfficialEditorial(titleSlug),
  ]);

  let editorialContent = officialEditorial;
  let editorialSource = 'official';

  if (!editorialContent) {
    editorialContent = await fetchTopCommunitySolution(titleSlug);
    editorialSource = 'community';
  }

  return {
    title: problem.title,
    difficulty: problem.difficulty,
    problemContent: problem.content,
    editorialContent: editorialContent,
    editorialSource,
  };
}

export const TagsFind = (post: any) => {
  return JSON.parse(JSON.parse(post.tags)[0]);
};

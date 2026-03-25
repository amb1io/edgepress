const HOST = import.meta.env.CMS_HOST;
export const slugify = (value: string, _separator: string = "-"): string => {
  return value
    .toString() // Cast to string (optional)
    .normalize("NFKD") // The normalize() using NFKD method returns the Unicode Normalization Form of a given string.
    .toLowerCase() // Convert the string to lowercase letters
    .trim() // Remove whitespace from both sides of a string (optional)
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\_/g, "-") // Replace _ with -
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/\-$/g, ""); // Remove trailing -
};
export const jobLink = (text: string, jobs: any) => {
  const slug = slugify(text);
  const job = jobs.find((job: any) => job.id.includes(slug));
  return job?.id.replace(".md", "");
};
export const TagsFind = (post: any) => {
  return JSON.parse(JSON.parse(post.tags)[0]);
};
export const TagsFormat = (post: any) => {
  const tags = TagsFind(post);
  delete post.tags;
  if (post.images) {
    post.images = JSON.parse(post.images);
  }
  return { ...post, ...tags };
};
export const GetJobs = async (params: any) => {
  const url = `${HOST}/job/${params.slug}`;
  console.log("GetJobs", url);
  const response = await fetch(url);
  return response.json();
};
export const GetPosts = async (params: any) => {
  const url = `${HOST}/posts`;
  console.log("GetPosts", url);
  const urlParams = params ? "?" + new URLSearchParams(params).toString() : "";
  const response = await fetch(url + urlParams);
  const { data } = await response.json();
  return data;
};
export const GetPostType = async (slug: string) => {
  const url = `${HOST}/posttype${slug}`;
  console.log("GetPostType", url);
  const response = await fetch(url);
  const { data } = await response.json();
  return data;
};
export const GetCategoriesPost = async (params: any) => {
  const url = `${HOST}/categories-to-posts`;
  console.log("GetCategoriesPost", url);
  const urlParams = params ? "?" + new URLSearchParams(params).toString() : "";
  const response = await fetch(url + urlParams);
  const { data } = await response.json();
  return data;
};
export const GetCategories = async (id: any = "", params: any = null) => {
  const url = `${HOST}/categories${id ? `/${id}` : ""}`;
  console.log("GetCategories", url);
  const urlParams = params ? "?" + new URLSearchParams(params).toString() : "";
  const response = await fetch(url + urlParams);
  const { data } = await response.json();
  return data;
};
export const GetPage = async (
  lang: string,
  postType: string,
  params: any = ""
) => {
  let posts = await GetPosts(params);
  if (!Array.isArray(posts)) {
    posts = [posts];
  }
  // console.log(posts);
  posts = posts
    .map((post: any) => {
      const tags = TagsFormat(post);
      if (
        tags.language &&
        tags.language.includes(lang) &&
        tags.posttype == postType
      ) {
        return { ...post, ...tags };
      }
    })
    .filter((post: any) => post);
  if (Array.isArray(posts)) {
    posts = posts[0];
  }
  return posts;
};
export const GetContent = async (
  lang: string,
  postType: string,
  params: object
) => {
  let posts;
  if (postType) {
    posts = await GetPostType("/" + postType);
  } else {
    posts = await GetPosts(params);
  }
  if (lang) {
    posts = posts.filter((post: any) => {
      const tags = TagsFind(post);
      const { language } = tags;
      if (language && language.includes(lang)) {
        return post;
      }
    });
  }
  if (postType) {
    posts = posts.filter((post: any) => {
      const tags = TagsFind(post);
      const { posttype } = tags;
      if (posttype == postType) {
        return post;
      }
    });
  }
  return posts.map((post: any) => TagsFormat(post));
};

export const FilterPost = async (post: any, lang: any, postType: any) => {
  const { language, posttype } = await TagsFormat(post);
  if (language && language.includes(lang) && posttype == postType) {
    return post;
  } else {
    return null;
  }
};

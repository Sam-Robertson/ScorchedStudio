export type PostMeta = {
    slug: string
    title: string
    date: string
    excerpt?: string
    coverImage?: string
    tags?: string[]
    readingTime?: string
  }
  
  export type Post = PostMeta & {
    content: string
    html?: string
  }
  
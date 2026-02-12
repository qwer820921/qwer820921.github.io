export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  category?: string;
  tags?: string[];
  author?: string; // Author name
  description?: string;
  content: string; // Markdown raw content
}

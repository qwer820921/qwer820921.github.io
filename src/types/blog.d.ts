export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  category?: string;
  tags?: string[];
  description?: string;
  content: string; // Markdown raw content
}

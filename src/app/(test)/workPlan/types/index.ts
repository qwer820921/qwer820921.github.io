export interface OutlineModule {
  key: string;
  order: number;
  content: {
    title: string;
    items: string[];
    [key: string]: any;
  };
}

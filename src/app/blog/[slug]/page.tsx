import { getAllPostSlugs, getPostData } from "@/app/blog/services/blogService";
import { MDXRemote } from "next-mdx-remote/rsc";
import styles from "../blogContent.module.css";
import { Metadata } from 'next';
import remarkGfm from 'remark-gfm';
import BackToListButton from "../components/BackToListButton";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const postData = await getPostData(slug);
  
  return {
    title: `${postData.title} | 子yee 萬事屋`,
    description: postData.description || `${postData.title} article`,
    authors: postData.author ? [{ name: postData.author }] : undefined,
    openGraph: {
      title: postData.title,
      description: postData.description,
      type: "article",
      images: [
        {
          url: "https://qwer820921.github.io/images/img15.jpg",
          width: 1200,
          height: 630,
          alt: postData.title,
        },
      ],
    },
    twitter: {
      title: postData.title,
      description: postData.description,
      images: ["https://qwer820921.github.io/images/img15.jpg"],
    },
  };
}

export async function generateStaticParams() {
  const paths = getAllPostSlugs();
  return paths.map((path) => ({
    slug: path.params.slug,
  }));
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const postData = await getPostData(slug);

  return (
    <article className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-8">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4 p-md-5">
              <header className="mb-5 pb-4 border-bottom">
                <BackToListButton mode="static" id="static-back-btn" />
                <h1 className="fw-bold mb-3 display-6">{postData.title}</h1>
                <div className="text-muted d-flex align-items-center gap-3">
                  {postData.author && (
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-person-fill"></i>
                      <span>作者:</span>
                      {postData.author}
                    </div>
                  )}
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-calendar3"></i>
                    <span>日期:</span>
                    {postData.date}
                  </div>
                </div>
              </header>
              
              <div className={styles.blogContent}>
                <MDXRemote source={postData.content} options={{
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                  },
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <BackToListButton mode="floating" targetId="static-back-btn" />
    </article>
  );
}

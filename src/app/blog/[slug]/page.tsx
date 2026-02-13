import { getAllPostSlugs, getPostData } from "@/app/blog/services/blogService";
import { MDXRemote } from "next-mdx-remote/rsc";
import contentStyles from "../blogContent.module.css";
import cardStyles from "./blogPost.module.css";
import { Metadata } from "next";
import remarkGfm from "remark-gfm";
import BackToListButton from "../components/BackToListButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
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

export default async function Post({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const postData = await getPostData(slug);

  return (
    <article className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-8">
          <div className={`card ${cardStyles.articleCard}`}>
            <div className={`card-body ${cardStyles.cardBody}`}>
              <header className={cardStyles.articleHeader}>
                <BackToListButton mode="static" id="static-back-btn" />
                <h1 className={cardStyles.articleTitle}>{postData.title}</h1>
                <div className={cardStyles.articleMeta}>
                  {postData.author && (
                    <div className={cardStyles.metaItem}>
                      <i
                        className={`bi bi-person-fill ${cardStyles.metaIcon}`}
                      ></i>
                      <span className={cardStyles.metaLabel}>作者:</span>
                      {postData.author}
                    </div>
                  )}
                  <div className={cardStyles.metaItem}>
                    <i className={`bi bi-calendar3 ${cardStyles.metaIcon}`}></i>
                    <span className={cardStyles.metaLabel}>日期:</span>
                    {postData.date}
                  </div>
                </div>
              </header>

              <div className={contentStyles.blogContent}>
                <MDXRemote
                  source={postData.content}
                  options={{
                    mdxOptions: {
                      remarkPlugins: [remarkGfm],
                    },
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <BackToListButton mode="floating" targetId="static-back-btn" />
    </article>
  );
}

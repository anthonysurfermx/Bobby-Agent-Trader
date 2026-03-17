// src/components/ui/blog-card.tsx
import { Link } from "react-router-dom";
import { Calendar, ArrowRight } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface BlogCardProps {
  slug: string;
  title: string;
  excerpt: string;
  date?: string;
  category?: string;
  tags?: string[];
  imageUrl?: string;
  author?: string;
}

const BlogCard = ({
  slug,
  title,
  excerpt,
  date,
  category,
  tags,
  imageUrl,
  author
}: BlogCardProps) => {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <Link to={`/blog/${slug}`} className="block h-full">
        <Card className="h-full bg-card hover:shadow-elegant transition-all duration-300 border-border hover:border-primary/30 overflow-hidden flex flex-col">
          {imageUrl ? (
            <div className="relative h-48 overflow-hidden">
              <img
                src={imageUrl}
                alt={title}
                className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                loading="lazy"
              />
              {category && (
                <div className="absolute top-3 left-3">
                  <Badge className="bg-primary/90 text-primary-foreground text-xs backdrop-blur-sm">
                    {category}
                  </Badge>
                </div>
              )}
            </div>
          ) : (
            <div className="relative h-48 overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-background flex items-center justify-center">
              <span className="text-4xl opacity-30">📝</span>
              {category && (
                <div className="absolute top-3 left-3">
                  <Badge className="bg-primary/90 text-primary-foreground text-xs backdrop-blur-sm">
                    {category}
                  </Badge>
                </div>
              )}
            </div>
          )}

          <CardHeader className="space-y-2 pb-2">
            {date && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                <span>{date}</span>
              </div>
            )}

            <h3 className="font-semibold text-lg text-foreground line-clamp-2 hover:text-primary transition-colors">
              {title}
            </h3>
          </CardHeader>

          <CardContent className="flex-1 pt-0">
            <p className="text-muted-foreground text-sm line-clamp-3 mb-3">
              {excerpt}
            </p>

            {author && (
              <div className="text-xs text-muted-foreground">
                Por {author}
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-0">
            <span className="inline-flex items-center text-primary hover:text-primary/80 transition-colors text-sm font-medium group">
              Leer artículo
              <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </span>
          </CardFooter>
        </Card>
      </Link>
    </motion.div>
  );
};

export default BlogCard;

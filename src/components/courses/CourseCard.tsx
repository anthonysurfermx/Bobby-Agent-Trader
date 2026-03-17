import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Clock,
  Users,
  Star,
  ExternalLink,
  PlayCircle,
  ArrowRight,
  Award,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Course } from '@/services/courses.service';

interface CourseCardProps {
  course: Course;
  index?: number;
  showExternalLink?: boolean;
  className?: string;
}

const CourseCard: React.FC<CourseCardProps> = ({ 
  course, 
  index = 0,
  showExternalLink = true,
  className = ""
}) => {
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Principiante': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'Intermedio': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'Avanzado': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'defi': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'defai': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'fintech': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400';
      case 'trading': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'defi': return '🏦';
      case 'defai': return '🤖';
      case 'fintech': return '💳';
      case 'trading': return '📈';
      default: return '📚';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={`group h-full ${className}`}
    >
      <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50 hover:border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex flex-wrap gap-2">
              <Badge className={getCategoryColor(course.category)}>
                <span className="mr-1">{getCategoryIcon(course.category)}</span>
                {course.category.toUpperCase()}
              </Badge>
              <Badge className={getLevelColor(course.level)}>
                {course.level}
              </Badge>
              {course.featured && (
                <Badge className="bg-yellow-500 text-white">
                  ⭐ Destacado
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-yellow-600">
              <Star className="w-4 h-4 fill-current" />
              <span className="font-medium">{course.rating.toFixed(1)}</span>
            </div>
          </div>

          <h3 className="text-lg font-bold line-clamp-2 group-hover:text-primary transition-colors">
            {course.title}
          </h3>
          
          <p className="text-sm text-muted-foreground line-clamp-3 mt-2">
            {course.description}
          </p>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Instructor */}
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                {course.instructor.charAt(0).toUpperCase()}
              </div>
              <span className="text-muted-foreground">Por {course.instructor}</span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 text-center py-3 border-t border-b border-border/50">
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-xs text-muted-foreground">Estudiantes</div>
                <div className="text-sm font-semibold">{course.students.toLocaleString()}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-xs text-muted-foreground">Duración</div>
                <div className="text-sm font-semibold">{course.duration}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Award className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-xs text-muted-foreground">Certificado</div>
                <div className="text-sm font-semibold">✅</div>
              </div>
            </div>

            {/* Topics preview */}
            {course.topics && course.topics.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Aprenderás sobre:</h4>
                <div className="flex flex-wrap gap-1">
                  {course.topics.slice(0, 3).map((topic, index) => (
                    <span
                      key={index}
                      className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground"
                    >
                      {topic}
                    </span>
                  ))}
                  {course.topics.length > 3 && (
                    <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">
                      +{course.topics.length - 3} más
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2 pt-2">
              <Button asChild className="w-full group-hover:shadow-md transition-shadow">
                <Link to={`/curso/${course.id}`}>
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Ver Curso
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>

              {showExternalLink && course.circle_url && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  asChild
                >
                  <a 
                    href={course.circle_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Comenzar en Circle.so
                  </a>
                </Button>
              )}
            </div>

            {/* Trending indicator for popular courses */}
            {course.students > 1000 && (
              <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950/20 px-2 py-1 rounded-full justify-center">
                <TrendingUp className="w-3 h-3" />
                <span>Curso Popular</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default CourseCard;
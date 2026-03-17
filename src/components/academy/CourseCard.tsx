import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Clock, Users, PlayCircle, Lock, ChevronRight, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  category: string;
  duration: number;
  students: number;
  rating: number;
  accessLevel: 'free' | 'premium';
  progress?: number;
  instructor: string;
  modules: number;
  youtubeUrl?: string;
}

interface CourseCardProps {
  course: Course;
  variant?: 'grid' | 'list';
}

export function CourseCard({ course, variant = 'grid' }: CourseCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isPremium = course.accessLevel === 'premium';
  const userRole = user?.user_metadata?.role as string | undefined;
  const isLocked = isPremium && (!user || userRole !== 'premium');

  const handleCourseClick = () => {
    if (isLocked) {
      navigate('/login?redirect=/academia&message=Premium+content+requires+login');
    } else {
      navigate(`/academia/curso/${course.id}`);
    }
  };

  if (variant === 'list') {
    return (
      <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="relative md:w-80 h-48 md:h-auto">
            <img
              src={course.thumbnail}
              alt={course.title}
              className="w-full h-full object-cover"
            />
            {isPremium && (
              <Badge className="absolute top-3 left-3 bg-gradient-to-r from-amber-500 to-amber-600">
                Premium
              </Badge>
            )}
            {isLocked && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Lock className="w-12 h-12 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-4 flex-1">
                <div>
                  <Badge variant="secondary" className="mb-2">
                    {course.category}
                  </Badge>
                  <h3 className="text-xl font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-muted-foreground mt-2 line-clamp-2">
                    {course.description}
                  </p>
                </div>

                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{course.duration}h</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{course.students}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{course.rating}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {course.modules} módulos
                  </div>
                </div>

                {course.progress !== undefined && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progreso</span>
                      <span className="font-medium">{course.progress}%</span>
                    </div>
                    <Progress value={course.progress} className="h-2" />
                  </div>
                )}
              </div>

              <Button
                onClick={handleCourseClick}
                disabled={isLocked && !user}
                className="ml-4"
              >
                {isLocked ? <Lock className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer"
          onClick={handleCourseClick}>
      <CardHeader className="p-0">
        <div className="relative aspect-video overflow-hidden">
          <img
            src={course.thumbnail}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {isPremium && (
            <Badge className="absolute top-3 left-3 bg-gradient-to-r from-amber-500 to-amber-600">
              Premium
            </Badge>
          )}
          {isLocked && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <Lock className="w-12 h-12 text-white" />
            </div>
          )}
          <div className="absolute bottom-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-sm">
            {course.duration}h
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="secondary" className="shrink-0">
            {course.category}
          </Badge>
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            <span className="text-sm font-medium">{course.rating}</span>
          </div>
        </div>

        <div>
          <h3 className="font-semibold line-clamp-2 group-hover:text-primary transition-colors">
            {course.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {course.description}
          </p>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>{course.students}</span>
            </div>
            <span>•</span>
            <span>{course.modules} módulos</span>
          </div>
        </div>

        {course.progress !== undefined && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progreso</span>
              <span className="font-medium">{course.progress}%</span>
            </div>
            <Progress value={course.progress} className="h-1.5" />
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button
          className="w-full group/btn"
          variant={isLocked ? "secondary" : "default"}
          disabled={isLocked && !user}
        >
          {isLocked ? (
            <>
              <Lock className="w-4 h-4 mr-2" />
              Requiere Premium
            </>
          ) : (
            <>
              <PlayCircle className="w-4 h-4 mr-2" />
              Ver Curso
              <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover/btn:translate-x-1" />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
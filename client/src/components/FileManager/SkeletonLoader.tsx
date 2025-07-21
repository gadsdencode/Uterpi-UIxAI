import React from 'react';
import { Card } from '../ui/card';

interface SkeletonLoaderProps {
  viewMode: 'grid' | 'list';
  count?: number;
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  viewMode,
  count = 6,
  className = ''
}) => {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  if (viewMode === 'list') {
    return (
      <div className={`space-y-3 ${className}`}>
        {skeletons.map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center space-x-4">
              {/* File Icon Skeleton */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse" />
              </div>
              
              {/* File Info Skeleton */}
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
                <div className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: `${40 + Math.random() * 20}%` }} />
              </div>
              
              {/* Tags Skeleton */}
              <div className="flex space-x-2">
                <div className="w-12 h-5 bg-gray-200 rounded-full animate-pulse" />
                <div className="w-16 h-5 bg-gray-200 rounded-full animate-pulse" />
              </div>
              
              {/* Status Skeleton */}
              <div className="w-20 h-6 bg-gray-200 rounded-full animate-pulse" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // Grid View
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 ${className}`}>
      {skeletons.map((i) => (
        <Card key={i} className="p-4">
          <div className="space-y-3">
            {/* File Icon Skeleton */}
            <div className="flex justify-center">
              <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse" />
            </div>
            
            {/* File Name Skeleton */}
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse mx-auto" style={{ width: `${70 + Math.random() * 20}%` }} />
              <div className="h-3 bg-gray-200 rounded animate-pulse mx-auto" style={{ width: `${50 + Math.random() * 20}%` }} />
            </div>
            
            {/* Tags Skeleton */}
            <div className="flex justify-center space-x-1">
              <div className="w-8 h-4 bg-gray-200 rounded-full animate-pulse" />
              <div className="w-10 h-4 bg-gray-200 rounded-full animate-pulse" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

// Empty State Skeleton
export const EmptyStateSkeleton: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center space-y-4">
      <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto animate-pulse" />
      <div className="space-y-2">
        <div className="h-6 bg-gray-200 rounded animate-pulse" style={{ width: '200px' }} />
        <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: '300px' }} />
      </div>
    </div>
  </div>
);

// Upload Area Skeleton
export const UploadAreaSkeleton: React.FC = () => (
  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-5 bg-gray-200 rounded animate-pulse mx-auto" style={{ width: '250px' }} />
        <div className="h-4 bg-gray-200 rounded animate-pulse mx-auto" style={{ width: '300px' }} />
      </div>
    </div>
  </div>
); 
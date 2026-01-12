export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Header Skeleton */}
      <div className="border-b border-[#E0DCD5] bg-white h-[73px]" />

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Title Skeleton */}
        <div className="text-center mb-12 space-y-4">
          <div className="h-10 w-48 bg-gray-200 rounded-lg mx-auto animate-pulse" />
          <div className="h-5 w-96 bg-gray-200 rounded-md mx-auto animate-pulse" />
        </div>

        {/* Section 1 Skeleton */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-7 w-64 bg-gray-200 rounded-md animate-pulse" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-32 bg-white rounded-2xl border border-[#E0DCD5] animate-pulse" />
            <div className="h-32 bg-white rounded-2xl border border-[#E0DCD5] animate-pulse" />
          </div>
        </div>

        {/* Section 2 Skeleton */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-7 w-64 bg-gray-200 rounded-md animate-pulse" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-32 bg-white rounded-2xl border border-[#E0DCD5] animate-pulse" />
            <div className="h-32 bg-white rounded-2xl border border-[#E0DCD5] animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  );
}

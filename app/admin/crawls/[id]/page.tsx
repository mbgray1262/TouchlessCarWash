'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCrawlJobById, getStatusColor, formatDate, type CrawlJob } from '@/lib/firecrawl';
import Link from 'next/link';

export default function CrawlDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCrawlJob = async () => {
    setLoading(true);
    const job = await getCrawlJobById(params.id as string);
    setCrawlJob(job);
    setLoading(false);
  };

  useEffect(() => {
    loadCrawlJob();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!crawlJob) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-600">Crawl job not found</p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/admin/crawls">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Crawls
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/admin/crawls">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Crawls
            </Link>
          </Button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#0F2744] mb-2">{crawlJob.url}</h1>
              <div className="flex items-center gap-3">
                <Badge className={`${getStatusColor(crawlJob.status)} border`}>
                  {crawlJob.status}
                </Badge>
                <span className="text-sm text-gray-600">
                  Job ID: {crawlJob.job_id || 'Pending'}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={loadCrawlJob}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Status</CardDescription>
              <CardTitle className="text-2xl capitalize">{crawlJob.status}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Pages Scraped</CardDescription>
              <CardTitle className="text-2xl">{crawlJob.results_count}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Created</CardDescription>
              <CardTitle className="text-lg">{formatDate(crawlJob.created_at)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>
                {crawlJob.completed_at ? 'Completed' : 'Updated'}
              </CardDescription>
              <CardTitle className="text-lg">
                {formatDate(crawlJob.completed_at || crawlJob.updated_at)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="config" className="space-y-4">
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="results">
              Results ({crawlJob.results_count})
            </TabsTrigger>
            {crawlJob.error_message && (
              <TabsTrigger value="error" className="text-red-600">
                Error
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Crawl Configuration</CardTitle>
                <CardDescription>Settings used for this crawl job</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
                  {JSON.stringify(crawlJob.crawl_config, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results">
            {crawlJob.results && crawlJob.results.length > 0 ? (
              <div className="space-y-4">
                {crawlJob.results.map((result: any, index: number) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            {result.metadata?.title || result.url || `Page ${index + 1}`}
                          </CardTitle>
                          {result.url && (
                            <CardDescription className="flex items-center gap-2 mt-2">
                              <ExternalLink className="w-4 h-4" />
                              <a
                                href={result.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                {result.url}
                              </a>
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {result.extract ? (
                        <div>
                          <h4 className="font-semibold mb-2">Extracted Data:</h4>
                          <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
                            {JSON.stringify(result.extract, null, 2)}
                          </pre>
                        </div>
                      ) : result.markdown ? (
                        <div>
                          <h4 className="font-semibold mb-2">Content Preview:</h4>
                          <div className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm max-h-96">
                            {result.markdown.slice(0, 500)}
                            {result.markdown.length > 500 && '...'}
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">No content available</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-600">No results yet</p>
                  {crawlJob.status === 'running' && (
                    <p className="text-sm text-gray-500 mt-2">
                      The crawl is still in progress. Check back later.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {crawlJob.error_message && (
            <TabsContent value="error">
              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600">Error Details</CardTitle>
                  <CardDescription>Information about the crawl failure</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">{crawlJob.error_message}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

interface CarWashData {
  name: string;
  category?: string;
  subtypes?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  state_code?: string;
  zip?: string;
  postal_code?: string;
  phone?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviews?: number;
  photos_count?: number;
  photo?: string;
  hours?: string;
  business_status?: string;
  verified?: boolean;
}

export default function ImportDataPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CarWashData[]>([]);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const isCarWash = (record: CarWashData): boolean => {
    const category = record.category?.toLowerCase() || '';
    const subtypes = record.subtypes?.toLowerCase() || '';

    if (category.includes('car wash') || subtypes.includes('car wash')) {
      return true;
    }

    if (category.includes('car detailing') || category.includes('auto detailing')) {
      return false;
    }

    return true;
  };

  const parseHours = (hoursString?: string): Record<string, any> => {
    if (!hoursString) return {};

    const hours: Record<string, string> = {};
    const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):\s*([^|]+)/gi;
    let match;

    while ((match = dayPattern.exec(hoursString)) !== null) {
      const day = match[1];
      const time = match[2].trim();
      hours[day.toLowerCase()] = time;
    }

    return hours;
  };

  const parseXLSX = (arrayBuffer: ArrayBuffer): CarWashData[] => {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    return jsonData.map((row: any) => ({
      name: row.name || row.Name || row.business_name || row['Business Name'],
      category: row.category || row.Category,
      subtypes: row.subtypes || row.Subtypes,
      address: row.address || row.Address,
      street: row.street || row.Street,
      city: row.city || row.City,
      state: row.state || row.State,
      state_code: row.state_code || row['State Code'] || row.state || row.State,
      zip: row.zip || row.Zip || row.ZIP,
      postal_code: row.postal_code || row['Postal Code'] || row.zip || row.Zip,
      phone: row.phone || row.Phone,
      website: row.website || row.Website || row.url || row.URL,
      latitude: parseFloat(row.latitude || row.Latitude) || undefined,
      longitude: parseFloat(row.longitude || row.Longitude) || undefined,
      rating: parseFloat(row.rating || row.Rating) || undefined,
      reviews: parseInt(row.reviews || row.Reviews || row.review_count || row['Review Count']) || undefined,
      photos_count: parseInt(row.photos_count || row['Photos Count']) || undefined,
      photo: row.photo || row.Photo || row.image || row.Image,
      hours: row.hours || row.Hours,
      business_status: row.business_status || row['Business Status'],
      verified: row.verified === 'TRUE' || row.verified === true,
    }));
  };

  const parseCSV = (text: string): CarWashData[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const parseLine = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
    const data: CarWashData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      const row: any = {};

      headers.forEach((header, index) => {
        const value = (values[index] || '').replace(/^["']|["']$/g, '');

        if (header.includes('name')) row.name = value;
        else if (header.includes('category')) row.category = value;
        else if (header.includes('subtype')) row.subtypes = value;
        else if (header === 'street') row.street = value;
        else if (header === 'address' && !header.includes('city')) row.address = value;
        else if (header.includes('city')) row.city = value;
        else if (header === 'state_code') row.state_code = value;
        else if (header === 'state') row.state = value;
        else if (header === 'postal_code') row.postal_code = value;
        else if (header.includes('zip')) row.zip = value;
        else if (header.includes('phone')) row.phone = value;
        else if (header.includes('website') || header.includes('url')) row.website = value;
        else if (header.includes('latitude')) row.latitude = parseFloat(value) || undefined;
        else if (header.includes('longitude')) row.longitude = parseFloat(value) || undefined;
        else if (header.includes('rating')) row.rating = parseFloat(value) || undefined;
        else if (header.includes('reviews')) row.reviews = parseInt(value) || undefined;
        else if (header.includes('photos_count')) row.photos_count = parseInt(value) || undefined;
        else if (header === 'photo') row.photo = value;
        else if (header.includes('hours')) row.hours = value;
        else if (header.includes('business_status')) row.business_status = value;
        else if (header.includes('verified')) row.verified = value === 'TRUE' || value === 'true';
      });

      if (row.name) {
        data.push(row);
      }
    }

    return data;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    const isXLSX = uploadedFile.name.endsWith('.xlsx') || uploadedFile.name.endsWith('.xls');
    const isCSV = uploadedFile.name.endsWith('.csv');

    if (!isXLSX && !isCSV) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV or XLSX file',
        variant: 'destructive',
      });
      return;
    }

    setFile(uploadedFile);
    setImportResults(null);

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        let parsed: CarWashData[];

        if (isXLSX) {
          parsed = parseXLSX(event.target?.result as ArrayBuffer);
        } else {
          parsed = parseCSV(event.target?.result as string);
        }

        const carWashesOnly = parsed.filter(isCarWash);
        const skipped = parsed.length - carWashesOnly.length;

        setParsedData(carWashesOnly);

        toast({
          title: 'File uploaded',
          description: `Found ${carWashesOnly.length} car wash businesses${skipped > 0 ? ` (${skipped} non-car-wash records skipped)` : ''}`,
        });
      } catch (error) {
        toast({
          title: 'Parse error',
          description: error instanceof Error ? error.message : 'Failed to parse file',
          variant: 'destructive',
        });
      }
    };

    reader.onerror = () => {
      toast({
        title: 'Error reading file',
        description: 'Failed to read the file',
        variant: 'destructive',
      });
    };

    if (isXLSX) {
      reader.readAsArrayBuffer(uploadedFile);
    } else {
      reader.readAsText(uploadedFile);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setParsedData([]);
    setImportResults(null);
  };

  const generateSlug = (name: string, city?: string, state?: string): string => {
    let slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (city) {
      slug += `-${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    }
    if (state) {
      slug += `-${state.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    }

    return slug;
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      toast({
        title: 'No data to import',
        description: 'Please upload a file first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    try {
      for (const row of parsedData) {
        const state = row.state_code || row.state || '';
        const rawZip = String(row.postal_code || row.zip || '').trim();
        const zip = rawZip.length === 4 && /^\d{4}$/.test(rawZip) ? rawZip.padStart(5, '0') : rawZip;
        const address = row.street || row.address || '';
        const slug = generateSlug(row.name, row.city, state);

        const { data: existing } = await supabase
          .from('listings')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();

        if (existing) {
          failCount++;
          errors.push(`${row.name}: Already exists`);
          continue;
        }

        const photos = row.photo ? [row.photo] : [];
        const hours = parseHours(row.hours);

        const { error } = await supabase
          .from('listings')
          .insert({
            name: row.name,
            slug: slug,
            address: address,
            city: row.city || '',
            state: state,
            zip: zip,
            phone: row.phone || null,
            website: row.website || null,
            latitude: row.latitude || null,
            longitude: row.longitude || null,
            rating: row.rating || 0,
            review_count: row.reviews || 0,
            photos: photos,
            hours: hours,
            is_touchless: null,
            touchless_confidence: 'unknown',
            crawl_status: row.website ? 'pending' : 'no_website',
            is_approved: true,
            wash_packages: [],
            amenities: [],
            source_state: state,
          });

        if (error) {
          failCount++;
          errors.push(`${row.name}: ${error.message}`);
        } else {
          successCount++;
        }
      }

      setImportResults({ success: successCount, failed: failCount, skipped: 0, errors });

      if (successCount > 0) {
        toast({
          title: 'Import completed',
          description: `Successfully imported ${successCount} car wash${successCount > 1 ? 'es' : ''}${failCount > 0 ? `. ${failCount} failed.` : ''}`,
        });
      } else {
        toast({
          title: 'Import failed',
          description: 'All records failed to import. Check the error details below.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/admin/listings">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Manage Listings
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-[#0F2744]">Import Car Wash Data</h1>
          <p className="text-gray-600 mt-2">
            Upload a CSV or Excel file containing car wash business information
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>File Upload</CardTitle>
            <CardDescription>
              Upload a CSV or XLSX file with car wash data. Supports standard Google Maps export format.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="fileUpload">Choose File</Label>
              <div className="mt-2">
                {!file ? (
                  <div className="relative">
                    <input
                      id="fileUpload"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('fileUpload')?.click()}
                      className="w-full h-32 border-dashed border-2"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="w-8 h-8 text-gray-400" />
                        <span className="text-sm font-medium">Click to upload CSV or Excel file</span>
                        <span className="text-xs text-gray-500">Supports .csv, .xlsx, .xls</span>
                      </div>
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <Upload className="w-5 h-5 text-[#22C55E]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-gray-500">
                            {parsedData.length} car wash{parsedData.length !== 1 ? 'es' : ''} ready to import
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {parsedData.length > 0 && (
                      <div className="mt-4 border-t pt-4">
                        <p className="text-sm font-medium mb-2">Preview (first 3 records):</p>
                        <div className="space-y-2">
                          {parsedData.slice(0, 3).map((record, index) => (
                            <div key={index} className="text-xs bg-gray-50 p-3 rounded">
                              <p className="font-medium">{record.name}</p>
                              <p className="text-gray-600">
                                {[record.city, record.state_code || record.state, record.postal_code || record.zip].filter(Boolean).join(', ')}
                              </p>
                              {record.rating && (
                                <p className="text-gray-500 mt-1">
                                  Rating: {record.rating} ({record.reviews} reviews)
                                </p>
                              )}
                              {record.website && (
                                <p className="text-blue-600 truncate mt-1">{record.website}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {importResults && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Import Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">{importResults.success} successfully imported</span>
                </div>
                {importResults.failed > 0 && (
                  <>
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">{importResults.failed} failed</span>
                    </div>
                    {importResults.errors.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">Error details:</p>
                        <div className="bg-red-50 border border-red-200 rounded p-3 max-h-48 overflow-y-auto">
                          {importResults.errors.map((error, index) => (
                            <p key={index} className="text-xs text-red-800 mb-1">{error}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button
            onClick={handleImport}
            disabled={loading || parsedData.length === 0}
            className="bg-[#22C55E] hover:bg-[#16A34A] text-white"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing {parsedData.length} records...
              </>
            ) : (
              `Import ${parsedData.length} Car Wash${parsedData.length !== 1 ? 'es' : ''}`
            )}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/listings">Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

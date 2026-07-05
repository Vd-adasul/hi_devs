import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const AWS_REGION = process.env.AWS_REGION;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

export class S3Service {
  private static instance: S3Service;
  private client: S3Client;

  private constructor() {
    this.client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID || '',
        secretAccessKey: AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  public static getInstance(): S3Service {
    if (!S3Service.instance) {
      S3Service.instance = new S3Service();
    }
    return S3Service.instance;
  }

  public async uploadFile(fileBuffer: Buffer, key: string, contentType: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      });

      await this.client.send(command);
      return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  }

  public async getFileBuffer(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      });

      const response = await this.client.send(command);
      if (!response.Body) {
        throw new Error('S3 file body is empty');
      }

      const streamToBuffer = async (stream: any): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          const chunks: any[] = [];
          stream.on('data', (chunk: any) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
      };

      return await streamToBuffer(response.Body);
    } catch (error) {
      console.error('S3 get error:', error);
      throw error;
    }
  }

  public async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      console.error('S3 delete error:', error);
      throw error;
    }
  }
}

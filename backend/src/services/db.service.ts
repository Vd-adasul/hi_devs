import { MongoClient, Db, Collection } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const MONGODB_URI = process.env.MONGODB_URI;

export class DbService {
  private static instance: DbService;
  private client: MongoClient | null = null;
  private db: Db | null = null;

  private constructor() {}

  public static getInstance(): DbService {
    if (!DbService.instance) {
      DbService.instance = new DbService();
    }
    return DbService.instance;
  }

  public async connect(): Promise<Db> {
    if (this.db) {
      return this.db;
    }

    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is missing.');
    }

    try {
      console.log('Connecting to MongoDB Atlas...');
      this.client = new MongoClient(MONGODB_URI);
      await this.client.connect();
      console.log('Connected to MongoDB successfully.');
      
      // Parse the DB name from the connection string or default to 'lawyeros'
      this.db = this.client.db('lawyeros');
      return this.db;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  public async getCollection<T extends Document = any>(name: string): Promise<Collection<T>> {
    const db = await this.connect();
    return db.collection<T>(name);
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('MongoDB connection closed.');
    }
  }
}

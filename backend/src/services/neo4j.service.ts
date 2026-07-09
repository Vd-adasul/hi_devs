import neo4j, { Driver } from 'neo4j-driver';
import dotenv from 'dotenv';
dotenv.config();

export class Neo4jService {
  private static instance: Neo4jService | null = null;
  private driver: Driver | null = null;

  private constructor() {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    if (uri && user && password) {
      try {
        this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
        console.log('Neo4j Driver initialized successfully.');
      } catch (err) {
        console.error('Failed to initialize Neo4j driver:', err);
      }
    } else {
      console.warn('Neo4j environment variables missing. Neo4j operations will be disabled.');
    }
  }

  public static getInstance(): Neo4jService {
    if (!Neo4jService.instance) {
      Neo4jService.instance = new Neo4jService();
    }
    return Neo4jService.instance;
  }

  public getDriver(): Driver | null {
    return this.driver;
  }

  public async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }

  public async createMatterNode(matterId: string, name: string, orgId: string): Promise<void> {
    if (!this.driver) return;
    const session = this.driver.session();
    try {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (m:Matter {id: $matterId})
           SET m.name = $name, m.orgId = $orgId
           RETURN m`,
          { matterId, name, orgId }
        )
      );
    } catch (err) {
      console.error(`Failed to create Matter node ${matterId} in Neo4j:`, err);
    } finally {
      await session.close();
    }
  }

  public async createDocumentNode(docId: string, matterId: string, name: string, type: string = 'general'): Promise<void> {
    if (!this.driver) return;
    const session = this.driver.session();
    try {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (d:Document {id: $docId})
           SET d.name = $name, d.type = $type
           WITH d
           MATCH (m:Matter {id: $matterId})
           MERGE (m)-[:CONTAINS]->(d)
           RETURN d`,
          { docId, matterId, name, type }
        )
      );
    } catch (err) {
      console.error(`Failed to create Document node ${docId} in Neo4j:`, err);
    } finally {
      await session.close();
    }
  }

  public async createClauseNode(
    clauseId: string,
    docId: string,
    type: string,
    text: string,
    riskLevel: string = 'low'
  ): Promise<void> {
    if (!this.driver) return;
    const session = this.driver.session();
    try {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (c:Clause {id: $clauseId})
           SET c.type = $type, c.text = $text, c.riskLevel = $riskLevel
           WITH c
           MATCH (d:Document {id: $docId})
           MERGE (d)-[:HAS]->(c)
           RETURN c`,
          { clauseId, docId, type, text, riskLevel }
        )
      );
    } catch (err) {
      console.error(`Failed to create Clause node ${clauseId} in Neo4j:`, err);
    } finally {
      await session.close();
    }
  }

  public async createPartyNode(clauseId: string, name: string, role: string): Promise<void> {
    if (!this.driver) return;
    const session = this.driver.session();
    try {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (p:Party {name: $name})
           SET p.role = $role
           WITH p
           MATCH (c:Clause {id: $clauseId})
           MERGE (c)-[:BINDS]->(p)
           RETURN p`,
          { clauseId, name, role }
        )
      );
    } catch (err) {
      console.error(`Failed to create Party node ${name} in Neo4j:`, err);
    } finally {
      await session.close();
    }
  }

  public async createCaseNode(clauseId: string, caseId: string, title: string, court: string = '', year: string = ''): Promise<void> {
    if (!this.driver) return;
    const session = this.driver.session();
    try {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (c:Case {id: $caseId})
           SET c.title = $title, c.court = $court, c.year = $year
           WITH c
           MATCH (cl:Clause {id: $clauseId})
           MERGE (cl)-[:CITES]->(c)
           RETURN c`,
          { clauseId, caseId, title, court, year }
        )
      );
    } catch (err) {
      console.error(`Failed to create Case node ${title} in Neo4j:`, err);
    } finally {
      await session.close();
    }
  }

  public async getGraphForMatter(matterId: string): Promise<{ nodes: any[]; edges: any[] }> {
    if (!this.driver) return { nodes: [], edges: [] };
    const session = this.driver.session();
    try {
      const result = await session.executeRead(tx =>
        tx.run(
          `MATCH (m:Matter {id: $matterId})
           OPTIONAL MATCH (m)-[r1:CONTAINS]->(d:Document)
           OPTIONAL MATCH (d)-[r2:HAS]->(c:Clause)
           OPTIONAL MATCH (c)-[r3:BINDS]->(p:Party)
           OPTIONAL MATCH (c)-[r4:CITES]->(ca:Case)
           RETURN m, d, c, p, ca, r1, r2, r3, r4`,
          { matterId }
        )
      );

      const nodesMap = new Map<string, any>();
      const edgesList: any[] = [];

      result.records.forEach(record => {
        const m = record.get('m');
        const d = record.get('d');
        const c = record.get('c');
        const p = record.get('p');
        const ca = record.get('ca');

        if (m) {
          nodesMap.set(m.properties.id || m.identity.toString(), {
            id: m.properties.id || m.identity.toString(),
            label: m.properties.name || 'Matter',
            type: 'Matter',
          });
        }
        if (d) {
          nodesMap.set(d.properties.id || d.identity.toString(), {
            id: d.properties.id || d.identity.toString(),
            label: d.properties.name || 'Document',
            type: 'Document',
            docType: d.properties.type,
          });
          edgesList.push({
            source: m.properties.id || m.identity.toString(),
            target: d.properties.id || d.identity.toString(),
            type: 'CONTAINS',
          });
        }
        if (c) {
          nodesMap.set(c.properties.id || c.identity.toString(), {
            id: c.properties.id || c.identity.toString(),
            label: c.properties.type || 'Clause',
            text: c.properties.text,
            type: 'Clause',
            riskLevel: c.properties.riskLevel,
          });
          edgesList.push({
            source: d.properties.id || d.identity.toString(),
            target: c.properties.id || c.identity.toString(),
            type: 'HAS',
          });
        }
        if (p) {
          const pId = `party_${p.properties.name}`;
          nodesMap.set(pId, {
            id: pId,
            label: p.properties.name,
            type: 'Party',
            role: p.properties.role,
          });
          edgesList.push({
            source: c.properties.id || c.identity.toString(),
            target: pId,
            type: 'BINDS',
          });
        }
        if (ca) {
          nodesMap.set(ca.properties.id || ca.identity.toString(), {
            id: ca.properties.id || ca.identity.toString(),
            label: ca.properties.title,
            type: 'Case',
            court: ca.properties.court,
            year: ca.properties.year,
          });
          edgesList.push({
            source: c.properties.id || c.identity.toString(),
            target: ca.properties.id || ca.identity.toString(),
            type: 'CITES',
          });
        }
      });

      // Deduplicate edges
      const edgeKeys = new Set<string>();
      const uniqueEdges = edgesList.filter(e => {
        const key = `${e.source}->${e.target}:${e.type}`;
        if (edgeKeys.has(key)) return false;
        edgeKeys.add(key);
        return true;
      });

      return {
        nodes: Array.from(nodesMap.values()),
        edges: uniqueEdges,
      };
    } catch (err) {
      console.error(`Failed to get Graph for Matter ${matterId} from Neo4j:`, err);
      return { nodes: [], edges: [] };
    } finally {
      await session.close();
    }
  }

  public async getGlobalOverviewGraph(orgId: string): Promise<{ nodes: any[]; edges: any[] }> {
    if (!this.driver) return { nodes: [], edges: [] };
    const session = this.driver.session();
    try {
      const result = await session.executeRead(tx =>
        tx.run(
          `MATCH (m:Matter {orgId: $orgId})
           OPTIONAL MATCH (m)-[r1:CONTAINS]->(d:Document)
           OPTIONAL MATCH (d)-[r2:HAS]->(c:Clause)
           OPTIONAL MATCH (c)-[r3:BINDS]->(p:Party)
           OPTIONAL MATCH (c)-[r4:CITES]->(ca:Case)
           RETURN m, d, c, p, ca, r1, r2, r3, r4`,
          { orgId }
        )
      );

      const nodesMap = new Map<string, any>();
      const edgesList: any[] = [];

      result.records.forEach(record => {
        const m = record.get('m');
        const d = record.get('d');
        const c = record.get('c');
        const p = record.get('p');
        const ca = record.get('ca');

        if (m) {
          nodesMap.set(m.properties.id || m.identity.toString(), {
            id: m.properties.id || m.identity.toString(),
            label: m.properties.name || 'Matter',
            type: 'Matter',
          });
        }
        if (d) {
          nodesMap.set(d.properties.id || d.identity.toString(), {
            id: d.properties.id || d.identity.toString(),
            label: d.properties.name || 'Document',
            type: 'Document',
            docType: d.properties.type,
          });
          if (m) {
            edgesList.push({
              source: m.properties.id || m.identity.toString(),
              target: d.properties.id || d.identity.toString(),
              type: 'CONTAINS',
            });
          }
        }
        if (c) {
          nodesMap.set(c.properties.id || c.identity.toString(), {
            id: c.properties.id || c.identity.toString(),
            label: c.properties.type || 'Clause',
            text: c.properties.text,
            type: 'Clause',
            riskLevel: c.properties.riskLevel,
          });
          if (d) {
            edgesList.push({
              source: d.properties.id || d.identity.toString(),
              target: c.properties.id || c.identity.toString(),
              type: 'HAS',
            });
          }
        }
        if (p) {
          const pId = `party_${p.properties.name}`;
          nodesMap.set(pId, {
            id: pId,
            label: p.properties.name,
            type: 'Party',
            role: p.properties.role,
          });
          if (c) {
            edgesList.push({
              source: c.properties.id || c.identity.toString(),
              target: pId,
              type: 'BINDS',
            });
          }
        }
        if (ca) {
          nodesMap.set(ca.properties.id || ca.identity.toString(), {
            id: ca.properties.id || ca.identity.toString(),
            label: ca.properties.title,
            type: 'Case',
            court: ca.properties.court,
            year: ca.properties.year,
          });
          if (c) {
            edgesList.push({
              source: c.properties.id || c.identity.toString(),
              target: ca.properties.id || ca.identity.toString(),
              type: 'CITES',
            });
          }
        }
      });

      const edgeKeys = new Set<string>();
      const uniqueEdges = edgesList.filter(e => {
        const key = `${e.source}->${e.target}:${e.type}`;
        if (edgeKeys.has(key)) return false;
        edgeKeys.add(key);
        return true;
      });

      return {
        nodes: Array.from(nodesMap.values()),
        edges: uniqueEdges,
      };
    } catch (err) {
      console.error(`Failed to get global graph from Neo4j:`, err);
      return { nodes: [], edges: [] };
    } finally {
      await session.close();
    }
  }

  public async getClauseNeighbors(clauseId: string): Promise<any[]> {
    if (!this.driver) return [];
    const session = this.driver.session();
    try {
      const result = await session.executeRead(tx =>
        tx.run(
          `MATCH (c:Clause {id: $clauseId})
           OPTIONAL MATCH (c)-[:BINDS]->(p:Party)
           OPTIONAL MATCH (c)-[:CITES]->(ca:Case)
           OPTIONAL MATCH (d:Document)-[:HAS]->(c)
           RETURN c, p, ca, d`,
          { clauseId }
        )
      );

      const neighbors: any[] = [];
      result.records.forEach(record => {
        const p = record.get('p');
        const ca = record.get('ca');
        const d = record.get('d');

        if (p) {
          neighbors.push({
            type: 'Party',
            summary: `Binds Party: ${p.properties.name} (${p.properties.role})`,
          });
        }
        if (ca) {
          neighbors.push({
            type: 'Case',
            summary: `Cites Case Precedent: ${ca.properties.title} [Court: ${ca.properties.court}, Year: ${ca.properties.year}]`,
          });
        }
        if (d) {
          neighbors.push({
            type: 'Document',
            summary: `Part of Document: ${d.properties.name}`,
          });
        }
      });
      return neighbors;
    } catch (err) {
      console.error(`Failed to get Clause Neighbors for ${clauseId} from Neo4j:`, err);
      return [];
    } finally {
      await session.close();
    }
  }
}

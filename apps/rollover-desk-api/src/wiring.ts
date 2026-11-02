// Builds use cases from concrete adapters, for server.ts and the end-to-end tests.
import type { Kysely } from 'kysely';
import { GetCurrentUser } from './application/use-cases/GetCurrentUser';
import { Login } from './application/use-cases/Login';
import { Portfolio } from './application/use-cases/Portfolio';
import { CreateProperty, GetProperty, ListProperties } from './application/use-cases/Properties';
import {
  ExportWorkbook,
  ImportHistory,
  ReviewImport,
  UploadRentRoll,
} from './application/use-cases/RentRollImports';
import type { IClock } from './domain/ports/IClock';
import type { ITokenService } from './domain/ports/ITokenService';
import { PropertyRepository } from './infrastructure/db/PropertyRepository';
import { RentRollRepository } from './infrastructure/db/RentRollRepository';
import type { Database } from './infrastructure/db/schema';
import { UserRepository } from './infrastructure/db/UserRepository';
import { AttentionRepository, RenewalRepository } from './infrastructure/db/WorkflowRepositories';
import { SpreadsheetReader } from './infrastructure/excel/SpreadsheetReader';
import { WorkbookWriter } from './infrastructure/excel/WorkbookWriter';
import { ScryptPasswordHasher } from './infrastructure/security/ScryptPasswordHasher';
import type { UseCases } from './interfaces/http/routes';

export function buildUseCases(db: Kysely<Database>, tokens: ITokenService, clock: IClock): UseCases {
  const users = new UserRepository(db);
  const properties = new PropertyRepository(db);
  const rentRolls = new RentRollRepository(db);
  return {
    login: new Login(users, new ScryptPasswordHasher(), tokens),
    getCurrentUser: new GetCurrentUser(users),
    listProperties: new ListProperties(properties),
    getProperty: new GetProperty(properties),
    createProperty: new CreateProperty(properties),
    uploadRentRoll: new UploadRentRoll(properties, rentRolls, new SpreadsheetReader(), clock),
    importHistory: new ImportHistory(properties, rentRolls),
    reviewImport: new ReviewImport(properties, rentRolls),
    exportWorkbook: new ExportWorkbook(properties, rentRolls, new WorkbookWriter(), clock),
    portfolio: new Portfolio({
      properties,
      rentRolls,
      attention: new AttentionRepository(db),
      renewals: new RenewalRepository(db),
      clock,
    }),
  };
}

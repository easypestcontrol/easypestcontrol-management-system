import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { OrgController } from './org/org.controller';
import { ClientsController } from './clients/clients.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { TechDashController } from './dashboard/techdash.controller';
import { CredentialsController } from './org/credentials.controller';
import { SearchController } from './search/search.controller';
import { DevicesController, NotificationsController } from './notifications/notifications.controller';
import { AuditsController } from './audits/audits.controller';
import { LeadsController } from './leads/leads.controller';
import { QuotationsController } from './quotations/quotations.controller';
import { PublicQuotesController } from './quotations/public-quotes.controller';
import { PublicDocsController } from './public-docs.controller';
import { ContractsController } from './contracts/contracts.controller';
import { DispatchController } from './dispatch/dispatch.controller';
import { JobsController } from './jobs/jobs.controller';
import { ScheduleController } from './jobs/schedule.controller';
import { InvoicesController } from './invoices/invoices.controller';
import { TeamController } from './team/team.controller';
import { CatalogueController } from './catalogue/catalogue.controller';
import { BranchesController } from './branches/branches.controller';
import { InventoryController } from './inventory/inventory.controller';
import { TechStockController } from './inventory/techstock.controller';
import { VendorsController } from './purchase/vendors.controller';
import { PurchaseOrdersController } from './purchase/purchase-orders.controller';
import { ReportsController } from './reports/reports.controller';
import { TrainingController } from './training/training.controller';
import { TripsController } from './trips/trips.controller';
import { WalletController } from './wallet/wallet.controller';
import { PayController } from './pay/pay.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    OrgController,
    ClientsController,
    DashboardController,
    TechDashController,
    CredentialsController,
    SearchController,
    NotificationsController,
    DevicesController,
    AuditsController,
    LeadsController,
    QuotationsController,
    PublicQuotesController,
    PublicDocsController,
    ContractsController,
    DispatchController,
    JobsController,
    ScheduleController,
    InvoicesController,
    TeamController,
    CatalogueController,
    BranchesController,
    InventoryController,
    TechStockController,
    VendorsController,
    PurchaseOrdersController,
    ReportsController,
    TrainingController,
    TripsController,
    WalletController,
    PayController,
  ],
})
export class AppModule {}

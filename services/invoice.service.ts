import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class InvoiceService {

  private apiUrl = 'http://127.0.0.1:3000/api/invoices';

  constructor(private http: HttpClient) {}

  private handleError(error: HttpErrorResponse) {
    return throwError(() => new Error(error.error?.message || error.message || 'Request failed'));
  }

  // Finance Officer
  getInvoiceQueue(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/queue`).pipe(catchError(this.handleError));
  }

  getInvoiceQueueDetails(reportId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/queue/${reportId}`).pipe(catchError(this.handleError));
  }

  generateInvoice(reportId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/generate/${reportId}`, {}).pipe(catchError(this.handleError));
  }

  getInvoice(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/invoice/${id}`).pipe(catchError(this.handleError));
  }

  confirmInvoice(id: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/confirm/${id}`, {}).pipe(catchError(this.handleError));
  }

  getPendingInvoices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/pending`).pipe(catchError(this.handleError));
  }

  sendInvoiceToCustomer(id: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/send/${id}`, {}).pipe(catchError(this.handleError));
  }

  getAcceptedInvoices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/accepted`).pipe(catchError(this.handleError));
  }

  getRejectedInvoices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/rejected`).pipe(catchError(this.handleError));
  }

  getPaidInvoices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/paid`).pipe(catchError(this.handleError));
  }

  getAutoCancelledInvoices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/auto-cancelled`).pipe(catchError(this.handleError));
  }

  getDashboardStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/dashboard`).pipe(catchError(this.handleError));
  }

  // Customer
  getInvoiceForCustomer(invoiceId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/customer/${invoiceId}`).pipe(catchError(this.handleError));
  }

  acceptInvoice(invoiceId: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/accept/${invoiceId}`, {}).pipe(catchError(this.handleError));
  }

  rejectInvoice(invoiceId: string, reason: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/reject/${invoiceId}`, { reason }).pipe(catchError(this.handleError));
  }

  cancelRejection(invoiceId: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/cancel-rejection/${invoiceId}`, {}).pipe(catchError(this.handleError));
  }
}
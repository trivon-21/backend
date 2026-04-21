import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InspectionTicketService {

  private apiUrl = 'http://127.0.0.1:3000/api/inspection-tickets';

  constructor(private http: HttpClient) {}

  // Customer — get or create ticket when landing on page
  getOrCreateTicket(orderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/order/${orderId}`);
  }

  // Customer — upload slip
  uploadSlip(ticketId: string, slipUrl: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/upload-slip/${ticketId}`, { slipUrl });
  }

  // Finance Officer
  getPendingVerification(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/pending`);
  }

  approvePayment(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/approve/${id}`, {});
  }

  rejectPayment(id: string, reason: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/reject/${id}`, { rejectionReason: reason });
  }

  getVerifiedPayments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/verified`);
  }

  getRejectedPayments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/rejected`);
  }
}
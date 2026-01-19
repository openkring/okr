import { DEFAULT_CURRENCY, DEFAULT_PERIODICITY } from "@bk2/shared-constants";

// ISO 4217 currency codes (3 letters)
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CHF'| string;

/**
 * MoneyModel is a representation of money, e.g. a price for a service or product.
 * We adhere to the model definition of Stripe's Money object 
 * see:  https://stripe.com/docs/api/prices/object#price_object-recurring-interval
 * Montary amounts are represented as Integers in the smallest currency unit (e.g. cents for USD), called minor unit.
 * This avoids rounding errors with floating point numbers.
 * 
 * This model is meant to be used as a value object inside other models, e.g. ReservationModel, ResourceModel, ProductModel, ServiceModel, etc.
 * 
 * Examples:
 * - price of a rowing boat rental
 * - price of a room booking
 * - price of a course registration
 */
export class MoneyModel {

    // always in the smallest
    public amount = 0;               // e.g. 4999 for 49.99 USD
    public currency: CurrencyCode = DEFAULT_CURRENCY;          // ISO 4217 currency code, e.g. USD, EUR, CHF   
    public periodicity = DEFAULT_PERIODICITY; // e.g. one-time, per hour, per day, per month, per year  

    constructor(amount: number, currency = DEFAULT_CURRENCY, periodicity = DEFAULT_PERIODICITY) {
        this.amount = amount;
        this.currency = currency;
        this.periodicity = periodicity;
    }
}

export const MoneyModelName = 'money';


// tbd: money: add tax info? tax rate, tax included/excluded?
// tbd: money: add discount info? discount amount or percentage?
// tbd: money: conversion rates
// tbd: money: helper functions for formatting, conversion, calculations
// tbd: define precision per CurrencyCode (e.g. JPY = 1, USD,EUR,GBP,CHF = 100, BHD,WKD,OMR = 1000)
// tbd: money symbol derived from CurrencyCode

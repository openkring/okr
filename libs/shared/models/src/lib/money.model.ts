import { DEFAULT_CURRENCY, DEFAULT_PERIODICITY } from "@bk2/shared-constants";

// ISO 4217 currency codes (3 letters)
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CHF'| string;

export interface CurrencyDefinition {
    symbol: string;
    name: string;
    precision: number;
    factor: number;
}

/**
 * precision: number of decimal places (e.g. JPY = 1, USD,EUR,GBP,CHF = 100, BHD,WKD,OMR = 1000)
 * factor: multiplier to convert to minor unit (e.g. cents)
 */
export const CurrencyDefinitions: { [key in CurrencyCode]: CurrencyDefinition } = {
    'USD': { symbol: '$', name: 'US Dollar', precision: 2, factor: 100 },
    'EUR': { symbol: '€', name: 'Euro', precision: 2, factor: 100 },
    'GBP': { symbol: '£', name: 'British Pound', precision: 2, factor: 100 },
    'CHF': { symbol: 'CHF', name: 'Swiss Franc', precision: 2, factor: 100 },
};

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

    // always in the smallest currency unit, e.g. cents for USD
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

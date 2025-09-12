import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppNavigationService } from './app-navigation.service';

// Create mock implementations without importing Ionic
const createMockModalController = () => ({
  dismiss: vi.fn().mockResolvedValue(true),
});

const createMockRouter = () => ({
  navigateByUrl: vi.fn().mockResolvedValue(true),
});

describe('AppNavigationService', () => {
  let service: AppNavigationService;
  let mockRouter: any;
  let mockModalController: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRouter = createMockRouter();
    mockModalController = createMockModalController();

    TestBed.configureTestingModule({
      providers: [
        AppNavigationService,
        { provide: Router, useValue: mockRouter },
        { provide: 'ModalController', useValue: mockModalController },
      ],
    });

    service = TestBed.inject(AppNavigationService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with empty history', () => {
      const history = service.getLinkHistory();
      expect(history).toEqual([]);
      expect(history).toHaveLength(0);
    });
  });

  describe('dismissModal', () => {
    it('should call modalController.dismiss with correct parameters', () => {
      // We need to mock the private modalController property
      const modalControllerSpy = vi.fn().mockReturnValue({
        dismiss: vi.fn().mockResolvedValue(true),
      });
      
      // Access private property for testing
      (service as any).modalController = {
        dismiss: modalControllerSpy,
      };

      service.dismissModal();

      expect(modalControllerSpy).toHaveBeenCalledWith(null, 'cancel');
    });
  });

  describe('pushLink', () => {
    it('should add URL to history', () => {
      const url = '/test-page';
      
      service.pushLink(url);
      
      const history = service.getLinkHistory();
      expect(history).toContain(url);
      expect(history).toHaveLength(1);
    });

    it('should add multiple URLs in order', () => {
      const urls = ['/page1', '/page2', '/page3'];
      
      urls.forEach(url => service.pushLink(url));
      
      const history = service.getLinkHistory();
      expect(history).toEqual(urls);
      expect(history).toHaveLength(3);
    });
  });

  describe('back', () => {
    it('should navigate to root when history is empty', () => {
      service.back();

      expect(mockRouter.navigateByUrl).toHaveBeenCalledOnce();
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('should navigate to previous URL when history has multiple items', () => {
      const urls = ['/page1', '/page2', '/page3'];
      urls.forEach(url => service.pushLink(url));

      service.back();

      expect(mockRouter.navigateByUrl).toHaveBeenCalledOnce();
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/page2');
      
      const history = service.getLinkHistory();
      expect(history).toEqual(['/page1', '/page2']);
    });
  });

  describe('resetLinkHistory', () => {
    it('should clear history when called without URL', () => {
      service.pushLink('/page1');
      service.pushLink('/page2');

      service.resetLinkHistory();

      const history = service.getLinkHistory();
      expect(history).toEqual([]);
      expect(history).toHaveLength(0);
    });

    it('should reset history with provided URL', () => {
      service.pushLink('/page1');
      service.pushLink('/page2');
      const newUrl = '/new-start';

      service.resetLinkHistory(newUrl);

      const history = service.getLinkHistory();
      expect(history).toEqual([newUrl]);
      expect(history).toHaveLength(1);
    });
  });

  describe('getLinkHistory', () => {
    it('should return empty array initially', () => {
      const history = service.getLinkHistory();
      
      expect(history).toEqual([]);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return current state of history', () => {
      const urls = ['/page1', '/page2', '/page3'];
      urls.forEach(url => service.pushLink(url));

      const history = service.getLinkHistory();

      expect(history).toEqual(urls);
    });
  });

  describe('logLinkHistory', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log empty history', () => {
      service.logLinkHistory();

      expect(consoleSpy).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalledWith('Link history:', []);
    });

    it('should log current history', () => {
      const urls = ['/page1', '/page2'];
      urls.forEach(url => service.pushLink(url));

      service.logLinkHistory();

      expect(consoleSpy).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalledWith('Link history:', urls);
    });
  });
});
/**
 * We use Jest to spy on document.querySelector to mock its behavior. 
 * When document.querySelector is called, it returns either null (indicating no split-pane element) or an empty object (indicating a split-pane element).
 * We also use Jest to mock window.innerWidth to control the window width for testing different scenarios.
 * The tests cover cases where no split-pane element is found, the window width is less than 992, and the window width is greater than or equal to 992.
 */
import { isInSplitPane } from './html.util'; 

describe('isInSplitPane function', () => {
  it('should return false when no split-pane element is found', () => {
    // Mock document.querySelector to return null
    jest.spyOn(document, 'querySelector').mockReturnValue(null);
    
    const result = isInSplitPane();
    expect(result).toBe(false);
  });

  it('should return false when window width is less than 992', () => {
    // Mock document.querySelector to return a split-pane element
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    jest.spyOn(document, 'querySelector').mockReturnValue(mockElement);

    // Mock window.innerWidth to be less than 992
    global.innerWidth = 800;

    const result = isInSplitPane();
    expect(result).toBe(false);
  });

  it('should return true when window width is greater than or equal to 992', () => {
    // Mock document.querySelector to return a split-pane element
    const mockElement = document.createElement('div');
    mockElement.classList.add('split-pane');
    jest.spyOn(document, 'querySelector').mockReturnValue(mockElement);
    
    // Mock window.innerWidth to be greater than or equal to 992
    global.innerWidth = 1000;
    
    const result = isInSplitPane();
    expect(result).toBe(true);
  });
});

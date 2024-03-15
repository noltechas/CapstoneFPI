from keras.callbacks import Callback
import numpy as np

class AverageMetrics(Callback):
    def __init__(self, n_epochs=10):
        super().__init__()
        self.n_epochs = n_epochs
        self.metrics_history = []

    def on_epoch_end(self, epoch, logs=None):
        # Add the current epoch's logs (metrics) to the history
        self.metrics_history.append(logs)

        # Ensure we only keep the last n_epochs worth of history
        if len(self.metrics_history) > self.n_epochs:
            self.metrics_history.pop(0)

        # Calculate the average for each metric over the last n_epochs
        if len(self.metrics_history) == self.n_epochs:
            averages = {}
            differences = {}
            current_epoch_metrics = self.metrics_history[-1]
            for metric in self.metrics_history[0].keys():
                metric_average = np.mean([logs[metric] for logs in self.metrics_history])
                averages[metric] = metric_average
                differences[metric] = round(current_epoch_metrics[metric] - metric_average, 3)

            print(f"\nAverages over the last {self.n_epochs} epochs: {averages}")
            #print(f"Differences: {differences}")
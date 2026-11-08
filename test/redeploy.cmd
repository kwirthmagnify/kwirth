kubectl config use-context k3d-kwirth
cd ..\docker
call docker-import-current-as.cmd latest
cd ..\test
kubectl delete -f .\kwirth-local-k3d.yaml
timeout 3
kubectl apply -f .\kwirth-local-k3d.yaml
